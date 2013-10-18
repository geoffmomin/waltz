(function($) {

	var Waltz = function() {
		var self = this;

		self.loginCredentials = false;
		self.cydoemusHost = "";

		self.loginForm = self.detectLogin();

		if (self.loginForm) {
			chrome.runtime.sendMessage({
				type: "getHost"
			}, function(host) {
				self.cydoemusHost = host;

				
				chrome.runtime.sendMessage({
					type: "getCredentials",
					domain: document.location.host

				}, function(creds) {
					if(creds.error) {
						if(creds.error === "authentication") {
							console.log("auth error");
						} else {
							console.log(creds.error, creds.status);
						}
					} else {
						if(creds.creds && self.loginForm) {
							self.loginCredentials = creds.creds	
						}
						self.drawClefWidget();		
					}
				});
			});
		}

		window.addEventListener('message', this.closeIFrame.bind(this));
	}


	//Checks if a login form exists.  Returns the login form container or false if one doesnt exist
	Waltz.prototype.detectLogin = function() {
		var passwordInputs = $("input[type='password']");

		var mostLikelyContainer = false;
		//Password inputs are a required input for any login form, so let's start there
		//Loop through each of the password inputs on the page try to figure out if it's a login form

		var passwordContainer = false;
		var passwordContainerScore = -1000;
		passwordInputs.each(function() {
			//We need to work up the DOM and find the container for entire login form.
			//Usually this will be a <form>, but not always, so we need to manually look for it
			var foundParent = false;
			var curParent = this;

			while(!foundParent && $(curParent).parent().length) {
				curParent =  $(curParent).parent();

				//For now let's just say that anything that contains multiple inputs is the form container
				if($(curParent).find("input").length > 1) {
					foundParent = true;
				}
			}

			if(foundParent) {

				//Login forms should only have one password input
				if($(curParent).find("input[type='password']").length > 1) {
					return false;
				}

				//Login forms should have at max one email input.  We can't always say the same for text inputs, so be specific
				if($(curParent).find("input[type='email']").length > 1) {
					return false;
				}

				//But Login forms should have at least 1 text or email field
				if($(curParent).find("input[type='email'], input[type='text']").length === 0) {
					return false;
				}

				//It's possible that there is an actual <form> container above this.  If so, let's
				//look for that and make sure we didn't jump too far up the tree
				var closestForm = $(curParent).closest("form");
				if($(closestForm).find("input[type='password'], input[type='email'], input[type='text']").length === $(curParent).find("input[type='password'], input[type='email'], input[type='text']").length) {
					curParent = closestForm;
				}

				//OK..  This is probably a login form.  But there may be other similar ones, so let's score them and compare
				var score = 0;

				var hasButtons = !!$(curParent).find("input[type='submit'], button, input[type='image']").length;
				var hasRememberMe = $(curParent).find("input[type='checkbox']").length === 1;
				var numWeirdInputs = $(curParent).find("input").not("[type='checkbox'], [type='text'], [type='email'], [type='password'], [type='submit'], [type='hidden']").length
				//We will decrease this by two because we expect two inputs on a login form
				//We also expect a rememberMe and a submit button, so add those back in as well.
				var numExtraNormalInputs = $(curParent).find("input").filter("[type='checkbox'], [type='text'], [type='email'], [type='password'], [type='submit']").length - 2 - hasRememberMe - hasButtons;


				score += hasButtons ? 1 : -1;
				score += hasRememberMe ? 1 : -1;
				score -= numWeirdInputs * 2;
				score -= numExtraNormalInputs;

				if(score > passwordContainerScore) {
					passwordContainer = curParent;
					passwordContainerScore = score;
				}
			}
		});
		if(!passwordContainer) {
			return false;
		}

		var passwordField = $(passwordContainer).find("input[type='password']");

		//As a note, these selectors will be ordered from least likely to most likely match

		//First of all, just grab the first text field, and choose that.  If nothing else matches, that's probably the one
		var usernameField = $(passwordContainer).find("input[type='text']").first();

		//Now let's try to find an email field.  Chances are that the email field is the username
		var emailField = $(passwordContainer).find("input[type='email']")
		if(emailField.length) {
			usernameField = emailField;
		}

		//There are a few common classes and IDs that usually indicate username fields.
		//This is a list of them, sorted by least likely to most likely. We will loop
		//through them looking for username fields
		var usernameClasses = [
			"login",
			"uid",
			"email",
			"user",
			"username"
		];

		for(var i=0,max=usernameClasses.length; i<max; i++) {
			var matches = $(passwordContainer).find("input."+usernameClasses[i]+", input#"+usernameClasses[i]);

			if(matches.length) {
				usernameField = $(matches).first();
			}
		}

		//OK, we probably have a username field now.  

		//We also have everything else, so let's build a useful reference object and return it

		return {
			container: passwordContainer,
			passwordField: passwordField,
			usernameField: usernameField
		};
	}

	Waltz.prototype.storeLogin = function(username, password) {
		chrome.runtime.sendMessage({
			domain: document.location.host,
			username: username,
			password: password
		});
	}

	Waltz.prototype.decryptCredentials = function(cb) {
		var self = this;
		if(self.loginCredentials && typeof(self.loginCredentials.password === "string")) {
			chrome.runtime.sendMessage({
				type: "decrypt",
				domain: document.location.host,
				value: self.loginCredentials.password

			}, function(response) {

				if(typeof(cb) === "function") {
					cb({
						username: self.loginCredentials.username,
						password: response.output,
						error: response.error
					});
				}

			});
		}
	}

	Waltz.prototype.encryptCredentials = function(credentials, cb) {
		chrome.runtime.sendMessage({
			type: "saveCredentials",
			domain: document.location.host,
			username: credentials.username,
			password: credentials.password
		}, function(response) {
			if(typeof(cb) === "function") {
				cb();
			}

		});
	}

	Waltz.prototype.loadIFrame = function() {
		if (this.iframe) return;

		var self = this;

		var $iframe = this.iframe = $("<iframe id='clef_iframe'>");

		$iframe.attr('src', self.cydoemusHost+'/login');

		$("body").append($iframe);

		$iframe.css({
			position: 'fixed',
			height: '100%',
			width: '100%',
			top: 0,
			left: 0,
			border: 'none',
			display: 'none',
			"z-index": 999999999
		});

		$iframe.on('load', function() {
			$iframe[0].contentWindow.postMessage(null, self.cydoemusHost);
		});
	}

	Waltz.prototype.logIn = function(cb) {
		var self = this;


		if (!this.iframe) {
			this.loadIframe
		}

		this.iframe.fadeIn();

		addEventListener("message", function(e) {
			if(e.data.auth) {
				self.iframe.remove();
				if (typeof cb == "function") {
					cb();
				}
			}
		});
	}

	Waltz.prototype.closeIFrame = function(e) {
		if (e.origin == this.cydoemusHost) {
			if (e.data && e.data.method == "closeIFrame" && this.iframe) {
				this.iframe.remove();
				this.iframe = false;
				this.loadIFrame();
			}
		}
	}


	Waltz.prototype.decryptAndLogIn = function() {
		var self = this;

		self.decryptCredentials(function(response) {
			if(response.error) {
				if(response.error === "authentication") {
					self.login(this);
				} else {
					console.log(response);
				}
			} else {
				self.fillAndSubmitLoginForm(response);
			}
		});
	}

	//Fills the login form and submits it
	Waltz.prototype.fillAndSubmitLoginForm = function(data) {
		var self = this;

		$(self.loginForm.usernameField).val(data.username);
		$(self.loginForm.passwordField).val(data.password);

		//Now let's try and submit this freaking form...
		if($(self.loginForm.container).is("form")) {  //If it's a <form>, then it's easy.
			chrome.runtime.sendMessage({
				type: "login",
				domain: document.location.host
			}, function() {});
			$(self.loginForm.container).submit();
		} else {
			//Now we just need to find the most likely button to click submit on..
			//Generally that's just going to be the last button on the form
			var button = $(self.loginForm.container).find("input[type='submit']").last();

			if(!button.length) {
				button = $(self.loginForm.container).find("button").last();
			}

			if(!button.length) {
				button = $(self.loginForm.container).find("input[type='image']").last();
			}

			if(button.length) {
				chrome.runtime.sendMessage({
					type: "login",
					domain: document.location.host
				}, function() {});
				$(button).click();
			} else {
				console.log('OH NOES!');
				//I guess if we get this far I don't really know what to do.  Will need to do some research
			}
		}
	}

	Waltz.prototype.checkAuthentication = function(cb) {
		var self = this;

		chrome.runtime.sendMessage({
			type: "checkAuthentication",
			domain: document.location.host
		}, function(response) {
			if (!response.user) {
				self.logIn(cb);
			} else {
				if (typeof(cb) == "function") {
					cb();
				}
			}
		});
	}

	Waltz.prototype.requestCredentials = function(form) {
		var _this = this,
			OVERLAY_ID = "waltz-credential-overlay",
			USERNAME_ID = "waltz-credential-username",
			PASSWORD_ID = "waltz-credential-password",
			SUBMIT_ID = "waltz-credential-submit",
			FORM_ID = "waltz-credential-form",
			SLIDE_IN_CLASS = "slide-in"

		// set up templates for tutorial
		var $overlay = $("<div id='" + OVERLAY_ID + "''></div>")
			$form = $("<div id='"+ FORM_ID + "'></div>")
			$usernameField = $("<input type='text' placeholder='Username' id='" + USERNAME_ID + "' />");
			$passwordField = $("<input type='password' placeholder='Password' id='" + PASSWORD_ID + "' />");
			$submitButton = $("<input type='submit' value='Submit' id='" + SUBMIT_ID + "' />");
			$body = $('body');

		// add tutorial templates
		$body.append($overlay);
		$form.append($usernameField).append($passwordField).append($submitButton);
		$body.append($form)

		//Put this on a timeout, because we need the class to be added after the initial draw
		setTimeout(function() {
			$.merge($overlay, $form).addClass(SLIDE_IN_CLASS);
		}, 0);

		$usernameField.focus();

		$.merge($usernameField, $passwordField).keyup(function(e) {
			if(e.which === 13) {
				submitForm(e);
			}
		});

		$submitButton.click(submitForm);

		$overlay.click(function() {
			$.merge($overlay, $form).removeClass(SLIDE_IN_CLASS);
			setTimeout(function() {
				$.merge($overlay, $form).remove();
			}, 500);
		});


		// capture the form submit, save our credentials, and then continue
		// the submit
		function submitForm(e) {
			e.preventDefault();

			// remove handlers that bind this event, so we don't go
			// into an infinite loop
			$submitButton.off('click');
			$.merge($usernameField, $passwordField).off("keyup");

			// get those credentials
			var credentials = {
				password: $passwordField.val(),
				username: $usernameField.val()
			}

			// store the credentials in the DB
			_this.encryptCredentials(credentials, function() {
				// BOOM!
				_this.fillAndSubmitLoginForm(credentials);
			});
		}

	}

	//Draws the clef widget and binds the interactions
	Waltz.prototype.drawClefWidget = function(form) {
		var self = this;

		//Grab image resource URLs from extensions API
		var wSource = chrome.extension.getURL("/img/waltz-128.png");
		var fSource = chrome.extension.getURL("/img/waltz-full.png");
		var pSource = chrome.extension.getURL("/img/pencil.png");
		var xSource = chrome.extension.getURL("/img/x.png");


		//Build HTML for clef widget
		var clefCircle = $("<div id='clef-waltz-login-wrapper' class='spinning'></div>");
		var waltzActions = $(
			"<button style='background-image:url("+xSource+");' class='waltz-button waltz-dismiss'></button>"
			+"<button style='background-image:url("+pSource+");' class='waltz-button waltz-edit'></button>"
			);

		//Style the widget with the correct image resource
		$(clefCircle).css({
			"background-image": "url("+wSource+")"
		}).append(waltzActions);

		$(document).ready(this.loadIFrame.bind(this));


		$(clefCircle).click(function() {
			$(this).addClass("loading");

			self.checkAuthentication(function() {
				if (self.loginCredentials) {
					self.decryptAndLogIn();
				} else {
					self.requestCredentials();
				}
			});

			setTimeout(function() {
				$(self).remove();
			}, 1000)
		});

		$(clefCircle).find(".waltz-dismiss").click(function(e) {
			e.stopPropagation();

			$(this).parent().addClass("remove");

			setTimeout(function() {
				$(self).remove();
			});
		});

		$(clefCircle).find(".waaltz-edit").click(function(e) {
			e.stopPropagation();

			self.checkAuthentication(function() {
				self.requestCredentials();
			});
		});


		$("body").append(clefCircle);

	}

	new Waltz();

})(jQuery);