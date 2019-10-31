const easywebserver = require('/srv/nodejs-easywebserver');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('./config.json'));
const mailboxdb = require('./mod-mailboxdb.js').create(config);

easywebserver
	.create([
		'forcedir',
		{path: '/mailboxdb.json', middleware: mailboxdb.middleware},
		'html'
	])
	.then(s => s.listen(parseInt(process.argv[2])));
