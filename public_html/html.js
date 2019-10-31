var html = {
	$: (function(arr) // shortcuts for commonly used html-elements
	{
		var map = {};
		arr.forEach(function(v)
		{
			map[v] = function()
			{
				return html.createElement.apply(null, [v].concat(Array.from(arguments)));
			};
		});
		return map;
	})(['div', 'span', 'ul', 'li', 'dl', 'dt', 'dd', 'input', 'textarea', 'button', 'label', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'tr', 'th', 'td', 'caption', 'header', 'footer', 'main', 'nav', 'br', 'hr', 'iframe', 'b', 'i', 'u', 'a', 'strong', 'link', 'script', 'style', 'title', 'html', 'body', 'head', 'article', 'aside', 'details', 'hgroup', 'section', 'summary', 'base', 'basefont', 'meta', 'datalist', 'fieldset', 'form', 'legend', 'meter', 'optgroup', 'option', 'select', 'blockquote', 'abbr', 'acronym', 'address', 'bdi', 'bdo', 'big', 'center', 'cite', 'code', 'del', 'dfn', 'em', 'font', 'ins', 'kbd', 'mark', 'output', 'pre', 'progress', 'q', 'rp', 'rt', 'ruby', 's', 'samp', 'small', 'strike', 'sub', 'sup', 'tt', 'var', 'wbr', 'dir', 'menu', 'ol', 'col', 'colgroup', 'tbody', 'thead', 'tfoot', 'noscript', 'area', 'audio', 'canvas', 'embed', 'figcaption', 'figure', 'frame', 'frameset', 'iframe', 'img', 'map', 'noframes', 'object', 'param', 'source', 'time', 'video']),
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
	_flatten: function(arr) // Recursively flatten array
	{
		var newArray = [];
		for(var v of arr)
		{
			if(Array.isArray(v))
			{
				if(v.length)
				{
					newArray = newArray.concat(html._flatten(v));
				} // else: ignore empty arrays
			}
			else
			{
				newArray.push(v);
			}
		}
		return newArray;
	},
	id: function(id) // get html-element by id
	{
		return document.getElementById(id);
	},
	eventhandlers: { // these functions can be used as event handlers ({on...: eventhandlers.function()})
		exportElementValue: function(obj, k)
		{
			if(typeof obj === 'object' && typeof k === 'string')
			{
				return function()
				{
					return obj[k] = this.element.value;
				};
			}
			else
			{
				return function(){ return this.element.value; };
			}
		}
	},
	createRenderer: function(fnc) // used by createElement, cannot be a root element, and is always embedded in a createElement, so no use of calling this directly
	{
		return {
			render: function(container, append)
			{
				this.parent = container;
				
				// set context of the child fnc to the parent
				// pass as first argument also the parent, we can use context or first argument, whichever is more convenient
				// and pass a function that will render the arguments-list, and possibly wrap in div if multiple components were specified
				var result = fnc.call(container.selfRef, container.selfRef, function()
				{
					if(arguments.length)
					{
						html.createElement('div', {}, Array.from(arguments)).render(container, append);
					}
					// else: nothing to render
				});
				if(result !== null && typeof result === 'object' && result.type === 'htmlElementComponent')
				{
					result.render(container, append);
				}
				
				return container;
			}
		};
	},
	createElement: function(tag, options) // the main function to create nested components dynamically by javascript, see html.$ for shortcuts of this method
	{
		var children = Array.from(arguments);
		if(options === null || (typeof options === 'object' && options.type !== 'htmlElementComponent' && Object.prototype.toString.call(options) === '[object Object]'))
		{
			options = options || {};
			children = children.slice(2); // tag and options removed
		}
		else
		{
			options = {};
			children = children.slice(1); // only tag removed, no options specified
		}
		var element = document.createElement(tag);
		var self = {
			type: 'htmlElementComponent',
			tag: tag,
			parent: null,
			listeners: {},
			element: element,
			children: [],
			state: options.state === null ? null : html._merge({}, options.state || {}) // support null-state, for stateless passthrough.. if explicitly set to null, 'this' refers to parent, it's as if this element does not exist..
		};
		delete options.state; // options.state cannot be used by reference to influence self.state anymore, so delete it for clarity
		
		// set selfReference, this may change to parent later, if state is null
		self.selfRef = self;
		
		// Flatten arrays recursively
		self.children = children = html._flatten(children);
		// Fix children to be HTML components
		for(var i=0;i<children.length;++i)
		{
			var child = children[i];
			if(typeof child === 'function')
			{
				// if a function is given, we intend to use it as an inline render-only object
				children[i] = html.createRenderer(child);
			}
			else if(typeof child !== 'object')
			{
				children[i] = html.createElement('span', {innerText: child});
			}
			else if(child === null)
			{
				children.splice(i--, 1);
			}
		}
		
		
		return html._merge(self, {
			updateProperties: function()
			{
				// Add properties (except state)
				for(var k in options)
				{
					if(Object.prototype.hasOwnProperty.call(options, k))
					{
						var v = options[k];
						if(k === 'className' && Array.isArray(v))
						{
							v = v.join(' ');
						}
						if(/^on[a-z]+$/gi.test(k))
						{
							// event handler
							self.updateListener(k, v);
						}
						else
						{
							// element[k] =  -> this won't work for attributes like element.style
							if(typeof element[k] !== 'object' && element[k] !== null && !Array.isArray(element[k]))
							{
								element[k] = html._merge(element[k], v);
							}
							else
							{
								html._merge(element[k], v);
							}
						}
					}
				}
			},
			updateState: function()
			{
				if(self !== self.selfRef)
				{
					return; // don't update state if passthrough
				}
				var s = self.state;
				s.isLoading = false;
				for(var k in s)
				{
					if(Object.prototype.hasOwnProperty.call(s, k))
					{
						(function(k, v)
						{
							// Automatically handle promises in first level of the state, and re-render upon completion
							if(typeof v === 'object' && v !== null)
							{
								if(v instanceof Promise)
								{
									s.isLoading = true;
									s[k] = {
										type: 'htmlPromiseHandler',
										promise: v
											.then(result => s[k] = result)
											.catch(error => s.error = error)
											.finally(self.render)
									};
								}
								else if(v.type === 'htmlPromiseHandler')
								{
									s.isLoading = true;
								}
							}
						})(k, s[k]);
					}
				}

			},
			isLoading: () => !!self.selfRef.state.isLoading,
			hasError: () => !!self.selfRef.state.error,
			setState: function(newstate)
			{
				html._merge(self.selfRef.state, newstate);
				
				self.selfRef.render();
			},
			updateListener: function(k, fnc)
			{
				if(typeof fnc !== 'function')
				{
					if(typeof self.listeners[k] === 'function')
					{
						element.removeEventListener(k.substring(2), self.listeners[k]);
						delete self.listeners[k];
					}
				}
				else if(self.listeners[k] !== fnc) // unless listener is already exactly equal
				{
					if(typeof self.listeners[k] === 'function')
					{
						element.removeEventListener(k.substring(2), self.listeners[k]);
					}
					element.addEventListener(k.substring(2), function(e){ options[k].call(self.selfRef, e); }, false);
					self.listeners[k] = fnc;
					
				}
			},
			appendTo: function(container)
			{
				return self.render(container, true); // alias for render with append=true
			},
			render: function(container, append)
			{
				if(container && container.element)
				{
					self.parent = container;
					// Test if stateless, passthrough
					var s = self;
					while(s.state === null)
					{
						if(!s.parent)
						{
							break;
						}
						s = s.parent;
					}
					self.selfRef = s; // set self-reference, in case of passthrough, this may not refer to itself
				}
				
				// Update properties
				self.updateProperties();
				
				// Update state
				self.updateState();
				
				// Update content
				if(self.children.length)
				{
					html.clearContent(self);
					
					for(var child of self.children)
					{
						child.render.call(child, self, true);
					}
				}
				
				// Update binding to parent
				if(container)
				{
					if(append)
					{
						html.appendContent(container, self);
					}
					else
					{
						html.setContent(container, self);
					}
				}
				
				return null; // explicitly return null for render function, as it should always be the last in chain, otherwise, when returning from Renderer it may result in rendering twice
			}
		});
	},
	clearContent: function(element) // html-element functionality wrapper
	{
		(element.element || element).innerHTML = '';
	},
	setContent: function(container, element) // html-element functionality wrapper
	{
		container = container.element || container;
		
		html.clearContent(container);
		container.appendChild((element.element || element));
	},
	appendContent: function(container, element) // html-element functionality wrapper
	{
		(container.element || container).appendChild((element.element || element));
	}
};
