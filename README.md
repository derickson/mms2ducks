# mms2ducks
MongoDB MMS Public monitoring API to Ducksboard integration.

![screenshot](https://raw.githubusercontent.com/derickson/mms2ducks/master/screen.jpg "mms2ducks screenshot")

This is a work in progress.


## Setup

npm install -d

edit the config file with your account keys etc.

node server.js

## TODO
* Maybe add more state-fulness around alerts etc.  Presently, events timeline completely refreshes each ping.
* make sure config server status lights are correct
* Consider config state when computing master status
