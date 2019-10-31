#!/bin/bash

node -e 'console.log(JSON.parse(require("fs").readFileSync("config.json")));'
