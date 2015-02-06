# mms2ducks
MongoDB MMS Public monitoring API to Ducksboard integration.

![screenshot](https://raw.githubusercontent.com/derickson/mms2ducks/master/screen.jpg "mms2ducks screenshot")

## Background

Ducksboard (https://ducksboard.com/) is an API driven dashboard purchased by New Relic.

MongoDB clusters are typically monitored by a tool call MongoDB Management Service (MMS).  Since version 1.5.0, MMS has had a publicly accessible data API for the statistics it's monitoring tool has collected.  You have to explicitly enable API access on your account in either cloud based MMS or the On-Premise version of MMS hosted behind your firewall. (https://docs.mms.mongodb.com/tutorial/use-mms-public-api/)

So while MMS is best in business when it comes to monitoring, automating, and backing up MongoDB, operations teams like centralized tools and need dashboards that cover their whole suite of infrastructure.  There are many options.  This project is just one example of pulling MMS data and pushing it into Ducksbaord using their PUSH APIs.

The first time mms2ducks runs it will query MMS and determine the shape of your MongoDB cluster.  If mms2ducks sees that you don't have an appropriately named dashboard yet it will then create a new dashboard on your Ducksboard account called "MONGO MMS" and add the right number of widgets based upon the shape of your MongoDB cluster.

Right now, if your MMS cluster shape ever changes, you can just stop mms2ducks, delete your "MONGO MMS" dashboard, and re-run.


## Setup

npm install -d

>> edit the config file with your account keys etc.

node server.js

## TODO
* Maybe add more state-fulness around alerts etc.  Presently, events timeline completely refreshes each ping.
* make sure config server status lights are correct (https://jira.mongodb.org/browse/MMSP-4549)
* Consider config state when computing master status (currently hacked to just be a count of config servers)
* parameterize which metrics make it to the two widgets for each shard
* figure out why the mongos isn't showing up

