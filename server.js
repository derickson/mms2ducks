// import for consuming REST
var http = require('http');
var request = require('request'); //https://github.com/request/request
var _ = require('underscore');


// import for MongoDB functionality
var async = require('async');

var accounts = require('./configStuff').accounts;

var DucksMMS = {
	'MMSusername' : accounts.MMSusername,
	'MMSpassword' : accounts.MMSpassword,
	'MMSurl' : 'https://mms.mongodb.com',
	
	'DucksUsername' : accounts.DucksUsername,
	
	'pullAlerts': function(groupId, itemsPerPage, pageNum, cb) {
		var path = '/api/public/v1.0/groups/'+ groupId +'/alerts?itemsPerPage='+itemsPerPage+'&pageNum='+pageNum;
		request.get( 
			{
				'method': 'GET',
				'uri': this.MMSurl + path,
				'auth': {
					'user': this.MMSusername,
					'pass': this.MMSpassword,
					'sendImmediately': false
				}
			},
			function (error, response, body) {
				if(!error){
					alerts = JSON.parse(body);
					
					var totalCount = alerts.totalCount;
					
					if( itemsPerPage > 20 && totalCount > 100 ) {
						var items = 10;
						var targetPageNum = Math.ceil( totalCount / items )
						var targetPageNum2 = targetPageNum - 1;
						
						DucksMMS.pullAlerts( groupId, items, targetPageNum, cb);
						DucksMMS.pullAlerts( groupId, items, targetPageNum2, cb);
						
					} else {
						cb(alerts);
					}
					
				} else {
					console.error('error: '+ response.statusCode)
					console.error(body)
				}
			}
		);
	},
	
	
	'pullCluster' : function(groupId, clusterId, cb) {		
		var path = '/api/public/v1.0/groups/'+groupId+'/hosts?clusterId=' + clusterId;
		request.get( 
			{
				'method': 'GET',
				'uri': this.MMSurl + path,
				'auth': {
					'user': this.MMSusername,
					'pass': this.MMSpassword,
					'sendImmediately': false
				}
			},
			function (error, response, body) {
				if(!error){
					cluster = JSON.parse(body);
					cb(cluster);
				} else {
					console.error('error: '+ response.statusCode)
					console.error(body)
				}
			}
		);

	},
	'pushEndpoint': function( payload , endpoint) {
		
		var url = 'https://push.ducksboard.com';
		var path = '/values/' + endpoint;
		
		var options = {
			'auth': {
				'user': this.DucksUsername,
				'pass': 'notused'
			},
			'json':true
		};
		
		request.post(url + path, _.extend(options, {'body': payload}));

		
	},
	
	'clearDucksData': function( endpoint, cb ) {
		var url = 'https://push.ducksboard.com';
		var path = '/values/' + endpoint;
		
		var options = {
			'auth': {
				'user': this.DucksUsername,
				'pass': 'notused'
			}
		};
		request.del( url + path, options ).on('response',  function( response ){
			if(response.statusCode !== 200){
				console.error('error clearing events')
			} else {
				cb();
			}
		});
	},
	
	'interpMMSAlerts': function(alerts) {
		
		async.each(
			alerts.results,
			function(alert, callback) {
				
				var image = 
					alert.status === "OPEN" ? "https://app.ducksboard.com/static/img/timeline/red.gif"   :
					alert.status === "CLOSED" ? "https://app.ducksboard.com/static/img/timeline/green.gif"   : 
					"https://app.ducksboard.com/static/img/timeline/orange.gif";
					
				var detail = '';
				detail += alert.typeName + ': ' + alert.eventTypeName + '\n';
				detail += 'Created: ' + alert.created + '\n';
				detail += alert.resolved ? 'Resolved: ' + alert.created + '\n' : '';
				
				duckAlert = {
					'timestamp': new Date(alert.created).getTime()/1000,
					'value': {
						'title': alert.eventTypeName,
						'image': image,
						'content': detail
					}
				}
				
				DucksMMS.pushEndpoint( duckAlert , 'events');

			},
			function(err){
				if(!err){
					console.log('Done');

				} else {
					console.error(err)
				}
			}
		);
	},
	
	'interpMMSCluster' : function(cluster){

		var board = [];
		var curSecs = new Date().getTime()/1000;

		async.each(
			cluster.results, 
			function(result, callback){

				var typeName = result.typeName;
				var typeChar = ''
				var isPrimary = false;
				var isSecondary = false;
				if(typeName == 'SHARD_MONGOS') {
					typeChar = 'S';
				} else if(typeName == 'SHARD_CONFIG') {
					typeChar = 'C';
				} else if(typeName == 'REPLICA_PRIMARY') {
					typeChar = 'D'; 
					isPrimary = true;
				} else if(typeName == 'REPLICA_SECONDARY') {
					typeChar = 'D';
					isSecondary = true;
				} else if(typeName == 'REPLICA_ARBITER') {
					typeChar = 'A';
				}

				var hostName = typeChar + ' ' + result.hostname + ':' + result.port;

				var shardMembership =  
					(isPrimary || isSecondary ) && result.shardName ? result.shardName : 
						typeChar === 'A' && result.replicaSetName ? result.replicaSetName :
						typeChar === 'C' ? 'config' : 
						typeChar === 'S' ? 'mongos' : 'UNKNOWN';


				var lastPing = new Date(result.lastPing).getTime()/1000;
				var lastPingAge = curSecs - lastPing;
				var lastPingAgeColor = 
					lastPingAge > 300 ? 'red' :
						lastPingAge > 180 ? 'yellow' :
						lastPingAge > 0 ? 'green' : 'gray';


				board.push({
					'name': hostName, 
					'values': [
						typeChar, 
						shardMembership,
						result.replicaStateName ? result.replicaStateName : ' ',
						lastPingAge
						], 
					'status': lastPingAgeColor
				});

				callback();
			},
			function(err){
				if(!err){
					var duckPayload = {"value": {"board": board}};

					DucksMMS.pushEndpoint( duckPayload , 'hosts');

				} else {
					console.error(err)
				}
			}
		);

	}
};



DucksMMS.pullCluster('542ad5aee4b0fbef73cb6d5b', '54c68f31e4b01fedf01f6518', DucksMMS.interpMMSCluster);
DucksMMS.clearDucksData('events', function() {
	DucksMMS.pullAlerts('542ad5aee4b0fbef73cb6d5b', 100, 1, DucksMMS.interpMMSAlerts);
});

