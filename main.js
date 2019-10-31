const easywebserver = require('./nodejs-easywebserver');
const fs = require('fs');

easywebserver
	.create([
		'forcedir',
		{name: 'mailboxdb', path: './', options: JSON.parse(fs.readFileSync('./config.json'))},
		'html'
	])
	.then(s => s.listen(parseInt(process.argv[2])));
