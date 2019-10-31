var controller = {
	_merge: (a, b) => // quickly merge object b with object a recursively
	{
		if(!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) || Array.isArray(b))
		{
			return a = b;
		}
		for(var k in b)
		{
			if(Object.prototype.hasOwnProperty.call(b, k))
			{
				if(typeof a[k] === 'object' && typeof b[k] === 'object' && !(Array.isArray(a[k]) || Array.isArray(b[k])))
				{
					html._merge(a[k], b[k]);
				}
				else
				{
					a[k] = b[k];
				}
			}
		}
		return a;
	},
	_jsonRequest: (path, data) =>
	{
        	return new Promise((resolve, reject) =>
        	{
        	    var xmlhttp = new XMLHttpRequest();
        	    xmlhttp.onreadystatechange = () =>
        	    {
        	        if(xmlhttp.readyState === 4)
        	        {
        	            if(xmlhttp.status !== 200)
        	            {
        	                reject({error: 'Status-code is not OK: ' + xmlhttp.status});
        	            }
        	            try
        	            {
        	                resolve(JSON.parse(xmlhttp.responseText));
        	            }
        	            catch(err)
        	            {
        	                reject(err);
        	            }
        	        }
        	    };
        	    xmlhttp.open('POST', controller.getContextPath(path));
        	    xmlhttp.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');
        	    xmlhttp.send(JSON.stringify(data));
	        });
	},
	_jsonAuthRequest: (data) =>
	{
		if(!model.session)
		{
			return new Promise((resolve, reject) => reject(new Error('Not logged in.')));
		}
		data.authToken = model.session.authToken;
		return controller._jsonRequest('./mailboxdb.json', data);
	},
	_resolve: (promise, defaultReturnValue) =>
	{
		return new Promise(function(resolve)
		{
			promise.then(resolve).catch(err => resolve(defaultReturnValue));
		});
	},
	_getResponse: async (args, nocache) =>
	{
		model.cache = model.cache || {};
		var key = JSON.stringify(args);
		
		if(nocache)
		{
			// immediately delete cache
			delete model.cache[key];
		}
		else
		{
			// check if in cache and is valid response, return from cache if possible
			var maybecached = model.cache[key];
			if(maybecached && maybecached.response) // only if the response was good too, we should use cache
			{
				return maybecached.response;
			}
		}
		// wait for request, and fill cache
		var cached = model.cache[key] = {response: await controller._jsonAuthRequest(args), createdEpochMS: Date.now()};
		controller.saveModel(); // save model cache, this should make it lightning fast, although certain elements we should update again if they are old, determine when rendering
		return cached.response;
	},
	_removeCache: (args) =>
	{
		model.cache = model.cache || {};
		delete model.cache[JSON.stringify(args)];
	},
	getContextPath: (path) => path,
	isLoggedIn: () => !!model.session,
	
	// List mailboxes
	invalidateMailboxes: () => controller._removeCache({action: 'list-mailboxes'}),
	listMailboxes: (nocache) => controller._getResponse({action: 'list-mailboxes'}, nocache),
	
	// List e-mails
	invalidateEmails: (options) => controller._removeCache(controller._merge({action: 'list-emails'}, options || {})),
	listEmails: (options, nocache) => controller._getResponse(controller._merge({action: 'list-emails'}, options || {}), nocache),
	
	// Get e-mail body
	invalidateEmailBody: (options) => controller._removeCache(controller._merge({action: 'get-email-body'}, options || {})),
	getEmailBody: (options, nocache) => controller._getResponse(controller._merge({action: 'get-email-body'}, options || {}), nocache),
	
	compareEmailFile: (a, b) => a === b || (a && b && a.mailbox && b.mailbox && a.filename === b.filename && a.mailbox.host === b.mailbox.host && a.mailbox.name === b.mailbox.name),
	
	// Login (authenticate user/pass combination with server)
	login: async (username, password) =>
	{
		var response = await controller._jsonRequest('./mailboxdb.json', {action: 'login', username: username, password: password}).catch(console.error);
		if(!response || response.result !== 'ok')
		{
			return {result: 'error', message: (response ? response.message : 'Unknown error, try again.')};
		}
		
		model.session = {authToken: response.authToken};
		controller.saveModel();
		return {result: 'ok'};
	},
	
	// Logout (remove authentication token from server)
	logout: () =>
	{
		if(model.session)
		{
			controller._jsonAuthRequest({action: 'logout'}).catch(console.error);
			delete model.session;
			model = {};
			controller.saveModel();
		}
		return {result: 'ok'};
	},
	
	// get model from localStorage, for the same domain this is secure, except that we need to be strict about what javascript is executed on this website
	loadModel: () =>
	{
		try
		{
			model = controller._merge(model || {}, JSON.parse(localStorage.getItem('model') || '{}'));
		}
		catch(ignore) {}
	},
	saveModel: () =>
	{
		localStorage.setItem('model', JSON.stringify(model));
	},
	
	init: () =>
	{
		controller.loadModel();
	}
};
