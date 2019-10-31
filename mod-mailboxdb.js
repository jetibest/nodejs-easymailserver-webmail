const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bodyparser = require('body-parser');

// handle authentication
// and support multiple domain names for hosting etc
module.exports = {
    create: function(options)
    {
        options = options || {};
        
        var tokensDir = path.resolve(__dirname, options.tokensDirectory || '');
        var jsonparser = bodyparser.json({limit: options.maxRequestSize || '16mb'});
        
        var mailboxdb = {
			path: '/mailboxdb.json',
			readJSONFile: async function(file)
			{
				try
				{
					return JSON.parse(await fs.promises.readFile(file));
				}
				catch(err)
				{
					return null;
				}
			},
            getUserByUsername: function(auth, username)
            {
                username = (username || '').toLowerCase();
                for(var i=0;i<auth.length;++i)
                {
                    var user = auth[i];
                    if(user.username === username)
                    {
                        return user;
                    }
                }
                return null;
            },
            hash: function(txt, algorithm, salt)
            {
                return crypto.createHmac(algorithm || 'sha256', salt || '').update(txt).digest('hex');
            },
            verifyPassword: function(password, txtpw)
            {
                if(typeof password === 'object')
                {
                    if(password.type === 'checksum')
                    {
                        return mailboxdb.hash(txtpw, password.algorithm, password.salt) === password.value;
                    }
                    else
                    {
                        return password.value === txtpw;
                    }
                }
                else
                {
                    return password === txtpw;
                }
            },
            verifyToken: async function(token)
            {
                try
                {
                    var tokenInfo = JSON.parse(await fs.promises.readFile(path.resolve(tokensDir, 'token-' + token + '.json')));
                    
                    if((tokenInfo.lastVerifiedEpochMS || tokenInfo.createdEpochMS) < Date.now() - 12*3600000) // 12 hour session
                    {
                        return false; // token is too old
                    }
                    
                    // update token if not updated for the last 5 minutes
                    if((tokenInfo.lastVerifiedEpochMS || tokenInfo.createdEpochMS) < Date.now() - 5*60000)
                    {
                        tokenInfo.lastVerifiedEpochMS = Date.now();
                        
                        // don't wait for this promise
                        fs.promises.writeFile(path.resolve(tokensDir, 'token-' + token + '.json'), JSON.stringify(tokenInfo));
                    }
                    
                    return token.split('.')[0].toLowerCase();
                }
                catch(err)
                {
					console.log('Error at verifyToken(' + token + '):');
					console.error(err);
                    return false;
                }
            },
			deleteToken: function(token)
			{
				return fs.promises.unlink(path.resolve(tokensDir, 'token-' + token + '.json'));
			},
            getNewTokenForUser: function(user)
            {
                return new Promise(function(resolve, reject)
                {
                    crypto.randomBytes(16, async function(err, buffer)
                    {
                        if(err)
                        {
                            return reject(err);
                        }
                        var token = user.username.toLowerCase() + '.' + buffer.toString('hex');
                        var tokenInfo = {
                            createdEpochMS: Date.now()
                        };
                        
                        await fs.promises.writeFile(path.resolve(tokensDir, 'token-' + token + '.json'), JSON.stringify(tokenInfo));
                        
                        resolve(token);
                    });
                });
            },
			filterMailboxName: function(str)
			{
				return str.replace(/[^a-z0-9+-]+/gi, '').split('+')[0];
			},
            middleware: function(req, res, next)
            {
                // options.auth -> {username, password: {type: 'checksum', algorithm: 'sha256', value: '...'}, mailboxes: ['/srv/.../*']}
                    jsonparser(req, res, async function()
                    {
			try
			{
	                        req.body = req.body || {};
	                        
	                        if(!req.body.action)
	                        {
	                            return next();
	                        }
	                        
	                        if(req.body.action === 'login')
	                        {
	                            var user = await mailboxdb.getUserByUsername(options.auth, req.body.username);
	                            if(!user)
	                            {
	                                return res.json({result: 'error', message: 'Username does not exist'});
	                            }
	                            if(!await mailboxdb.verifyPassword(user.password, req.body.password))
	                            {
	                                return res.json({result: 'error', message: 'Incorrect password.'});
	                            }
	                            
	                            // send back a session ID
	                            
	                            
	                            return res.json({result: 'ok', authToken: await mailboxdb.getNewTokenForUser(user)});
	                        }
	                        
							var username;
	                        if(!req.body.authToken || !(username = await mailboxdb.verifyToken(req.body.authToken)))
	                        {
	                            return res.json({result: 'error', message: 'Invalid authentication token. Please, login again.'});
	                        }
	                        
	                        // here we are logged in, and we have verified our authentication token
	                        // for any action, we always need to get the user
	                        // but the user is part of the token:

	                        var user = await mailboxdb.getUserByUsername(options.auth, username);
	                        
							if(req.body.action === 'logout')
							{
								try
								{
									await mailboxdb.deleteToken(req.body.authToken);
									return res.json({result: 'ok', message: 'Authentication token invalidated.'});
								}
								catch(err)
								{
									return res.json({result: 'error', message: 'Unable to invalidate authentication token. Maybe it is already invalidated.'});
								}
							}
	                        else if(req.body.action === 'list-mailboxes')
	                        {
	                            // mailboxes: ["/srv/mail.masteryeti.com/storage/*"], so we need to derive the wildcards, and return {host: '', name: ''} format
	                            // there should always be a domain-name formatted in the path-name, otherwise it shouldn't be in a string, but an object {host: '', path: ''}
	                            var mailboxes = [];
	                            
	                            for(var mailbox of user.mailboxes || [])
	                            {
	                                var mailboxdirname = path.basename(mailbox.path);
	                                
	                                // mailbox directory names are not allowed to contain a comma, but this was already stripped from email address anyway
	                                if(mailboxdirname === '*')
	                                {
	                                    // only the basename may be a wildcard, this is a limitation that should be mentioned for the config.json file.. its specific use is to have access to all mailboxes for a host, similar but not equivalent to the idea of a catch-all
	                                    // split out based on the directories in that directory
	                                    var mailboxparentdir = path.resolve(mailbox.path, '..');
	                                    var dirlist = await fs.promises.readdir(mailboxparentdir, {withFileTypes: true}).catch(()=>{}) || [];
	                                    var names = dirlist.filter(entry => entry.isDirectory()).map(entry => entry.name);
	                                    
	                                    for(var name of names)
	                                    {
	                                        mailboxes.push({
	                                            host: mailbox.host,
	                                            name: name
	                                        });
	                                    }
	                                }
	                                else
	                                {
	                                    mailboxes.push({
	                                        host: mailbox.host,
	                                        name: mailboxdirname
	                                    });
	                                }
	                            }
	                            
	                            res.json({result: 'ok', mailboxes: mailboxes});
	                        }
	                        else if(req.body.action === 'list-emails')
	                        {
	                            var mailboxHost = req.body.mailboxHost || '*'; // by default, list emails for all hosts
	                            var mailboxName = req.body.mailboxName || '*'; // by default, list emails for all mailboxes
	                            var toEpochMS = req.body.toEpochMS || Date.now(); // from this point in time, we go back to list page-by-page results for the emails
	                            var pageIndex = req.body.pageIndex || 0;
								
								if(mailboxName !== '*')
								{
									mailboxName = mailboxdb.filterMailboxName(mailboxName);
								}
								
								var mailboxes = user.mailboxes.filter(mailbox => (mailboxHost === '*' || mailbox.host === mailboxHost) && (mailboxName === '*' || path.basename(mailbox.path) === mailboxName || path.basename(mailbox.path) === '*'));
								
								if(!mailboxes.length)
								{
									res.json({result: 'error', message: 'Mailbox not found.'});
									return;
								}
								
								// manually select mailbox from path, because we may use wildcards in the name from both ways
								// if mailboxName is wildcard, this is .length >= 1.. otherwise length is just 1 (except if we matched multiple hosts)
								var paths = [];
								for(var mailbox of mailboxes)
								{
									var mailboxparentdir = path.resolve(mailbox.path, '..');
									if(mailboxName === '*')
									{
										var dirlist = await fs.promises.readdir(mailboxparentdir, {withFileTypes: true}).catch(()=>{}) || [];
										var names = dirlist.filter(entry => entry.isDirectory()).map(entry => entry.name);
										for(var name of names)
										{
											paths.push({mailbox: {host: mailbox.host, name: name}, path: path.resolve(mailboxparentdir, name)});
										}
									}
									else
									{
										paths.push({mailbox: {host: mailbox.host, name: mailboxName}, path: path.resolve(mailboxparentdir, mailboxName)});
									}
								}
								
								// now that we have the paths, check if they exist, and list the emails from each mailbox
								var emails = [];
								for(var p of paths)
								{
									var dirlist = await fs.promises.readdir(p.path, {withFileTypes: true}).catch(()=>{}) || [];
									var names = dirlist.filter(entry => entry.isFile() && /\.mail\.json$/gi.test(entry.name)).map(entry => entry.name);
									for(var name of names)
									{
										emails.push({mailbox: p.mailbox, filename: name, email: await mailboxdb.readJSONFile(path.resolve(p.path, name))});
									}
								}
								
	                            res.json({result: 'ok', emails: emails, pageIndex: pageIndex, toEpochMS: toEpochMS});
	                        }
							else if(req.body.action === 'get-email-body')
							{
								var mailboxHost = req.body.mailboxHost;
								var mailboxName = req.body.mailboxName;
								var emailFilename = (req.body.emailFilename || '').replace(/\.[a-z0-9-]+\.json$/gi, '') + '.body.json';
								
								if(!mailboxHost || !mailboxName || !emailFilename) return res.json({result: 'error', message: 'Missing mailbox or e-mail filename.'});
								
								var mailboxes = user.mailboxes.filter(mailbox => (mailbox.host === mailboxHost) && (path.basename(mailbox.path) === mailboxName || path.basename(mailbox.path) === '*'));
								
								if(!mailboxes.length) return res.json({result: 'error', message: 'Mailbox not found, or no access to this mailbox.'});
								
								// find paths for mailboxHost/mailboxName combination
								var dir = mailboxes[0].path;
								if(/\*$/gi.test(dir))
								{
									dir = path.resolve(path.resolve(mailboxes[0].path, '..'), mailboxdb.filterMailboxName(mailboxName));
								}
								var emailFile = path.resolve(dir, emailFilename.replace(/[^a-z0-9.-]+/gi, ''));
								try
								{
									var emailBody = JSON.parse(await fs.promises.readFile(emailFile));
									res.json({result: 'ok', emailBody: emailBody});
								}
								catch(err)
								{
									console.log('Error for get-email-body(' + mailboxHost + ', ' + mailboxName + ', ' + emailFilename + '):');
									console.error(err);
									res.json({result: 'error', message: 'E-mail not found.'});
								}
							}
	                        else
	                        {
	                            res.json({result: 'error', message: 'Action not implemented.'});
	                        }
			}
			catch(err)
			{
				console.error(err);
				res.json({result: 'error', message: 'Server error'});
			}
                    });
            }
        };
        return mailboxdb;
    }
};
