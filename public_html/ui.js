var ui = (function($)
{
return {
	mailboxitem: (mailbox, c) =>
	{
		var s = c.state;
		var isSelected = typeof s.selectedMailbox === 'object'
				&& s.selectedMailbox !== null
				&& s.selectedMailbox.host === mailbox.host
				&& s.selectedMailbox.name === mailbox.name;
		return $.li(
		{
			className: ['webmail-mailboxes-item', isSelected ? 'selected' : ''],
			onclick: function()
			{
				if(s.selectedMailbox && s.selectedMailbox.name === mailbox.name && s.selectedMailbox.host === mailbox.host)
				{
					// Re-validate emails
					controller.invalidateEmails({mailboxHost: s.selectedMailbox.host, mailboxName: s.selectedMailbox.name});
				}
				else
				{
					// Select a new mailbox
					s.selectedMailbox = {
						name: mailbox.name,
						host: mailbox.host
					};
				}
				c.render();
			}
		}, mailbox.name + '@' + mailbox.host);
	},
	mailboxlist: (c) =>
	{
		return $.div({
				className: 'webmail-mailboxes-view',
				state: {
					mailboxesResponse: controller.listMailboxes()
				}
			},
			function()
			{
				if(this.hasError()) return $.div('Error: Could not load mailboxes.');
				if(this.isLoading()) return $.div('Loading...');
				if(!this.state.mailboxesResponse.mailboxes.length) return $.div('No mailboxes, configure your account.');
				
				return $.ul(
					this.state.mailboxesResponse.mailboxes.map(mailbox => ui.mailboxitem(mailbox, c))
				);
			}
		);
	},
	emailrow: (emailFile, showMailbox, c) =>
	{
		return $.tr({
				className: ['webmail-emails-row'].concat(controller.compareEmailFile(c.state.selectedEmailFile, emailFile) ? ['selected'] : [])
			},
			$.td($.input({type: 'checkbox', autocomplete: 'off', checked: false, onchange: function()
				{
					
				}
			})),
			showMailbox ? $.td(emailFile.mailbox.name + '@' + emailFile.mailbox.host) : null,
			$.td(emailFile.email.from.text),
			$.td(emailFile.email.subject),
			$.td(emailFile.email.date),
			$.td($.input({type: 'button', value: 'Open', onclick: function()
				{
					if(c.state.selectedEmailFile === emailFile)
					{
						// Opening same file again, means reload
						controller.invalidateEmailBody({
							mailboxHost: emailFile.mailbox.host,
							mailboxName: emailFile.mailbox.name,
							emailFilename: emailFile.filename
						});
					}
					c.state.selectedEmailFile = emailFile;
					c.render();
				}
			}))
		);
	},
	emailslist: (c) =>
	{
		var selectedMailbox = c.state.selectedMailbox;
		return $.div(
			{
				className: 'webmail-emails-view',
				state: {
					emailsResponse: controller.listEmails(!selectedMailbox ? null : {mailboxHost: selectedMailbox.host, mailboxName: selectedMailbox.name})
				}
			},
			function()
			{
				if(this.hasError()) return $.div('Error: Could not load emails.');
				if(this.isLoading()) return $.div('Loading...');
				if(this.state.emailsResponse.result !== 'ok' || !this.state.emailsResponse.emails.length) return $.div('This folder is empty.');
				
				return $.table({className: 'webmail-emails-table'},
					$.tr(
						$.th(),
						!selectedMailbox ? $.th('Mailbox') : null,
						$.th('From'),
						$.th('Subject'),
						$.th('Date'),
						$.th()
					),
					this.state.emailsResponse.emails.map(emailFile => ui.emailrow(emailFile, !selectedMailbox, c))
				);
			}
		);
	},
	emailpanel: (c) =>
	{
		var selectedEmailFile = c.state.selectedEmailFile;
		return $.div(
			{
				className: 'webmail-email-view',
				state: {
					emailBodyResponse: selectedEmailFile ? controller.getEmailBody({
							mailboxHost: selectedEmailFile.mailbox.host,
							mailboxName: selectedEmailFile.mailbox.name,
							emailFilename: selectedEmailFile.filename
						}) : null
				}
			},
			$.div({className: 'webmail-email-toolbar'}, 'Toolbar for email'),
			function()
			{
				if(!selectedEmailFile) return $.div('-');
				
				if(this.hasError()) return $.div('Could not load e-mail.');
				if(this.isLoading()) return $.div('Loading...');
				if(this.state.emailBodyResponse.result !== 'ok') return $.div(this.state.emailBodyResponse.message);
				
				var htmlCode = this.state.emailBodyResponse.emailBody.html;
				return $.div({className: 'webmail-email-body'},
					$.iframe({
						className: 'webmail-email-bodyframe',
						height: '10',
						onload: function()
						{
							var doc = this.element.contentWindow.document;
							doc.open();
							doc.write(htmlCode);
							doc.write(htmlCode);
							doc.write(htmlCode);
							doc.close();
						}
					})
				);
			},
			$.div({className: 'webmail-email-toolbar'}, 'Toolbar for email')
		);
	},
	inbox: (c) =>
	{
		return $.div({className: 'webmail-app-view'},
			$.div({className: 'webmail-apptoolbar-view'},
				$.input({
					type: 'button',
					value: 'Logout',
					onclick: async function()
					{
						await controller.logout();
						c.render();
					}
				})
			),
			$.div({
					className: 'webmail-contentviews-view',
					state: {
						selectedEmailFile: null,
						selectedMailbox: null
					}
				},
				$.div({className: 'webmail-navcontent-view', state: null}, // state-passthrough
					ui.mailboxlist,
					ui.emailslist
				),
				// Move this in a separate ui-component, specifying only the element previousSibling and the height-setter
				$.div({
					state: {
						onmousemove: function(e)
						{
							if(this.state.dragPosInitial)
							{
								this.state.dragDelta = (e.pageY || e.clientY || 0) - this.state.dragPosInitial;
								if(!this.state.isDragging && Math.abs(this.state.dragDelta) >= 10)
								{
									// threshold crossed, let's start dragging
									this.state.isDragging = true;
									// setup an overlay div, to avoid interaction problems with possible iframes
									this.state.overlayElement = $.div({
										style: {
											position: 'fixed',
											left: '0px',
											top: '0px',
											width: '100%',
											height: '100%',
											cursor: 'ns-resize',
											backgroundColor: 'transparent'
										}
									});
									this.state.overlayElement.render(document.body, true);
								}
								if(this.state.isDragging)
								{
									this.element.previousSibling.style.height = this.element.previousSibling.style.maxHeight = Math.min(100*(window.innerHeight-120)/window.innerHeight, Math.max(10, 100 * (this.state.dragHeightInitial + this.state.dragDelta) / window.innerHeight))  + 'vh';
								}
							}
						},
						onmouseup: function(e)
						{
							if(this.state.isDragging)
							{
								delete this.state.isDragging;
								delete this.state.dragHeightInitial;
								delete this.state.dragPosInitial;
								
								window.removeEventListener('mousemove', this.state.onmousemoveHandler);
								window.removeEventListener('mouseup', this.state.onmouseupHandler);
								
								document.body.removeChild(this.state.overlayElement.element);
							}
						}
					},
					className: 'webmail-flexdragger-horizontal',
					onmousedown: function(e)
					{
						// set potential for dragstart
						e = e || window.event;
						this.state.dragHeightInitial = this.element.previousSibling.offsetHeight + 0;
						this.state.dragPosInitial = e.pageY || e.clientY || 0;
						this.state.onmousemoveHandler = e => this.state.onmousemove.call(this, e || window.event);
						this.state.onmouseupHandler = e => this.state.onmouseup.call(this, e || window.event);
						window.addEventListener('mousemove', this.state.onmousemoveHandler, false);
						window.addEventListener('mouseup', this.state.onmouseupHandler, false);
						e.preventDefault();
						return false;
					}
				}),
				ui.emailpanel
			)
		);
	},
	login: (c) =>
	{
		var local = {};
		return $.div({state: {}},
			$.h1('Webmail'),
			(self) =>
			{
				if(self.state.loginErrorMessage)
				{
					return $.div('Login error: ' + self.state.loginErrorMessage);
				}
			},
			$.dl(
				$.dt('Username:'),
				$.dd(
					$.input({type: 'text', value: '', onchange: html.eventhandlers.exportElementValue(local, 'username')})
				),
				$.dt('Password:'),
				$.dd(
					$.input({type: 'password', value: '', onchange: html.eventhandlers.exportElementValue(local, 'password')})
				)
			),
			$.input({type: 'button', value: 'Login', onclick: async function()
			{
				var response = await controller.login(local.username, local.password);
				if(response.result === 'ok')
				{
					c.render();
				}
				else
				{
					this.parent.state.loginErrorMessage = response.message;
					this.parent.render();
				}
			}})
		);
	},
	main: (c) =>
	{
		return $.div({
				state: {
					loggedIn: controller.isLoggedIn()
				}
			},
			(self) =>
			{
				if(self.state.loggedIn)
				{
					return ui.inbox(c);
				}
				else
				{
					return ui.login(c);
				}
			}
		);
	},
	init: (container) =>
	{
		return $.div(ui.main).render(container);
	}
};
})(html.$);
