# nodejs-easymailserver-webmail
This is a webapplication using NodeJS, for making webmail available for nodejs-easymailserver. Beware: UNDER CONSTRUCTION.

# Installation
```bash
cd /srv && git clone https://github.com/jetibest/nodejs-easymailserver-webmail

# Install dependency: nodejs-easywebserver
cd /srv/nodejs-easymailserver-webmail
rm -f nodejs-easywebserver
git clone https://github.com/jetibest/nodejs-easywebserver
```

## Integration in systemd

**`/root/nodejs-easymailserver-webmail.service`**:
```
[Unit]
Description=Webmail for nodejs-easymailserver using NodeJS

[Service]
Type=simple
WorkingDirectory=/srv/nodejs-easymailserver-webmail
ExecStart=/bin/bash -c 'cd /srv/nodejs-easymailserver-webmail/ && node main.js 8081'

[Install]
WantedBy=multi-user.target
```

```bash
systemctl enable /root/nodejs-easymailserver-webmail.service
systemctl start nodejs-easymailserver-webmail
```
