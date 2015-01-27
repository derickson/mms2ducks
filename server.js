// import libraries for handling REST
var request = require('request'); //https://github.com/request/request
var _ = require('underscore');
var async = require('async');

// separate config file
var config = require('./configStuff').config;

var DucksMMS = {
	'pingInterval': 30,
	
	'MMSusername' : config.MMSusername,
	'MMSpassword' : config.MMSpassword,
	'MMSurl' : config.MMSurl,
	
	'DucksApiKey' : config.DucksApiKey,
	'DucksUsername': config.DucksUsername,
	'DucksPassword': config.DucksPassword,
	
	'shardNames' : config.shardNames,
	
	'eventsSlot': 'mongo_mms_events',
	'hostsSlot': 'mongo_mms_hosts',
	
	
	'mmsDashboardName': 'Mongo MMS',
	'mmsDashboardSlug': 'mongo-mms',
	
	'mmsGet' : function (url, cb) {
		request.get(
			{
				'method': 'GET',
				'uri': url,
				'auth': {
					'user': this.MMSusername,
					'pass': this.MMSpassword,
					'sendImmediately': false
				}
			},
			function (error, response, body) {
				if(!error){
					var responseBody = JSON.parse(body);
					cb(responseBody);
				} else {
					console.error('error: '+ response.statusCode)
					console.error(body)
				}
			}
		);
	},
	
	'ducksGet': function(url, cb) {
		request.get(
			{
				'method': 'GET',
				'uri': url,
				'auth': {
					'user': this.DucksApiKey,
					'pass': 'notused'
				}
			},
			function (error, response, body) {
				if(!error){
					console.log("GET " + url + "   " + response.statusCode);
					var responseBody = JSON.parse(body);
					cb(responseBody);
				} else {
					console.error('error: '+ response.statusCode)
					console.error(body)
				}
			}
		);
	},
	
	'ducksPost': function(url, payload, cb) {
		var options = {
			'auth': {
				'user': this.DucksApiKey,
				'pass': 'notused'
			},
			'json':true
		};
		
		request.post(
			{
				'method': 'POST',
				'uri': url,
				'auth': {
					'user': this.DucksApiKey,
					'pass': 'notused'
				},
				'json':true,
				'body': payload 
			},
			function (error, response, body) {
				if(!error){
					console.log("POST " + url + "   " + response.statusCode);
					if(cb) {
						cb();
					}
				} else {
					console.error('error: '+ response.statusCode)
					console.error(body)
				}
			}
		);
		
		
		//request.post(url, _.extend(options, {'body': payload})).on('response', function(response){
		//	console.log("POST " + url + "   " + response.statusCode);
		//	//console.log( response.body );
		//	if(cb) {
		//		cb();
		//	}
		//});
	},
	
	'ducksDelete': function( url , cb ){
		var options = {
			'auth': {
				'user': this.DucksApiKey,
				'pass': 'notused'
			},
			'json':true
		};
		
		request.del(url, options).on('response', function(response){
			console.log( response.statusCode);
			console.log( response.body );
			if(cb) {
				cb();
			}
		});
	},
	
	'ducksPut': function (url, payload, cb) {
		var options = {
			'auth': {
				'user': this.DucksApiKey,
				'pass': 'notused'
			},
			'json':true
		};
		
		request.put(url, _.extend(options, {'body': payload})).on('response', function(response){
			console.log( response.statusCode);
			console.log( response.body );
			if(cb) {
				cb(response.body);
			}
		});
	},
	
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
	
	'metricsOfInterestSet' : {
		'OPCOUNTERS_CMD': 1,
		'OPCOUNTERS_QUERY': 1,
		'OPCOUNTERS_UPDATE': 1,
		'OPCOUNTERS_DELETE': 1,
		'OPCOUNTERS_GETMORE': 1,
		'OPCOUNTERS_INSERT': 1,
		'DB_STORAGE_TOTAL': 1,
		'MEMORY_RESIDENT': 1,
		'EFFECTIVE_LOCK_PERCENTAGE': 1,
		'BACKGROUND_FLUSH_AVG': 1
	},
	
	'pullStatsForPrimary': function( primary ) {
		var curSecs = new Date().getTime()/1000;
		var lastPointSecs = new Date(primary.lastPing).getTime()/1000;
		DucksMMS.mmsGet( primary.links[0].href + '/metrics', function( body ){
			var primaryStats = {
				'replicaSetName': primary.replicaSetName,
				'dataPoints': []
			};
			async.each(
				_.filter(body.results, function(item){
					return ( item.metricName === 'OPCOUNTERS_CMD' || 
								item.metricName === 'OPCOUNTERS_QUERY' || 
								item.metricName === 'OPCOUNTERS_UPDATE' || 
								item.metricName === 'OPCOUNTERS_DELETE' || 
								item.metricName === 'OPCOUNTERS_GETMORE' || 
								item.metricName === 'OPCOUNTERS_INSERT' || 
								item.metricName === 'DB_STORAGE_TOTAL'|| 
								item.metricName === 'MEMORY_RESIDENT'|| 
								item.metricName === 'EFFECTIVE_LOCK_PERCENTAGE'|| 
								item.metricName === 'BACKGROUND_FLUSH_AVG');
				}), 
				function(item, callback){
					DucksMMS.mmsGet(item.links[0].href, function(metric){
						async.each(
							_.filter(metric.dataPoints, function(point){
								var pointSecs = new Date(point.timestamp).getTime()/1000;
							    //console.log(pointSecs);
								return  (curSecs - pointSecs  <= curSecs - lastPointSecs + 120);
							}),
							function(dataPoint,callbackStat) {
								var pointSecs = new Date(dataPoint.timestamp).getTime()/1000;
								var datum = {
										'timestamp': pointSecs,
										'age': curSecs - pointSecs,
										'lastPingAge': curSecs - lastPointSecs,
										'value': dataPoint.value,
										'metric': metric.metricName,
									};
								primaryStats.dataPoints.push(datum);
								callbackStat();
							},
							function(err){
								if(err){
									console.error(err)
								}
								callback();
							}
						);
					});
				},
				function(err){
					if(!err){
						DucksMMS.pushPrimaryMetrics(primaryStats);

					} else {
						console.error(err)
					}
				}
			);
		});
	},
	
	'pushPrimaryMetrics': function( primaryStats ) {
		var payload = {};
		var replicaSetName = primaryStats.replicaSetName;
		
		async.each(
			primaryStats.dataPoints,
			function(dataPoint, callback){
				var stat = replicaSetName + '_' + dataPoint.metric;
				if(! payload[stat] ){
					payload[stat] = [];
				} 
				payload[stat].push({
					'timestamp': dataPoint.timestamp,
					'value': dataPoint.value
				});
				callback();
			},
			function(err){
				if(!err) {
					DucksMMS.pushEndpoint( payload, '' );
					//console.log(payload);
				} else {
					console.error(err);
				}
			}
		);
	},
	
	'pushEndpoint': function( payload , endpoint) {
		
		var url = 'https://push.ducksboard.com';
		var path = '/values/' + endpoint;
		
		var options = {
			'auth': {
				'user': this.DucksApiKey,
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
				'user': this.DucksApiKey,
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
					alert.status === 'OPEN' ? 'https://app.ducksboard.com/static/img/timeline/red.gif'   :
					alert.status === 'CLOSED' ? 'https://app.ducksboard.com/static/img/timeline/green.gif'   : 
					'https://app.ducksboard.com/static/img/timeline/orange.gif';
					
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
					DucksMMS.pullStatsForPrimary( result );
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
						lastPingAge > 180 || (result.replicaStateName && result.replicaStateName === 'DOWN' )? 'yellow' :
						lastPingAge > 0 ? 'green' : 'gray';


				board.push({
					'name': hostName, 
					'values': [
						result.hasStartupWarnings, 
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
					var duckPayload = {'value': {'board': board}};

					DucksMMS.pushEndpoint( duckPayload , DucksMMS.hostsSlot);

				} else {
					console.error(err)
				}
			}
		);

	},
	
	'requestDashboards': function(cb) {
		var url = 'https://app.ducksboard.com';
		var path = '/api/dashboards';
		
		DucksMMS.ducksGet( url + path, function( body ) {
			//console.log(body);
			if(cb) cb(body);
		});
	},
	
	'deleteDashboard': function(cb) {
		console.log("Deleting Dashboard");
		var url = 'https://app.ducksboard.com';
		var path = '/api/dashboards/' + DucksMMS.mmsDashboardSlug;
		
		DucksMMS.ducksDelete(url + path, cb);
	},
	
	'createDashboard': function(cb) {
		console.log("Creating Dashboard");
		var url = 'https://app.ducksboard.com';
		var path = '/api/dashboards/';
		
		var dash = {
			name: DucksMMS.mmsDashboardName,
			background: 'white'
		};
		
		DucksMMS.ducksPost( url + path, dash, cb);
	},
	
	'getDashWidgets': function(slug, cb) {
		var url = 'https://app.ducksboard.com';
		var path = '/api/dashboards/'+slug+'/widgets/';
		
		DucksMMS.ducksGet( url + path, function( body ) {
			//console.log(JSON.stringify(body, undefined, 2));
			if(cb) {
				cb( body );
			}
		});
		
	},
	
	'createWidget': function( widget, cb ) {		
		DucksMMS.ducksPost( 'https://app.ducksboard.com/api/widgets/',  widget, cb);
	}
};


function ping() {
	DucksMMS.pullCluster(config.MMSgroupId, config.MMSclusterId, DucksMMS.interpMMSCluster);
	//DucksMMS.clearDucksData('events', function() {
	//	DucksMMS.pullAlerts(config.MMSgroupId, 100, 1, DucksMMS.interpMMSAlerts);
	//});
	
}


var eventWidget =
{
	'widget': {
		'sound': false,
		'width': 1,
		'kind': 'custom_textual_timeline',
		'dashboard': DucksMMS.mmsDashboardSlug,
		'title': 'MMS Alerts',
		'column': 1,
		'row': 1,
		'height': 4
	},
		'slots': {
			'1': {
		'		label': DucksMMS.eventsSlot
			}
	}
};

var hostWidget =
{
	'widget': {
		'sound': false,
		'width': 2,
		'kind': 'custom_textual_status_leaderboard5',
		'dashboard': DucksMMS.mmsDashboardSlug,
		'title': 'Hosts',
		'column': 4,
		'row': 1,
		'height': 4
	},
	'slots': {
		'1': {
			'color8': '',
			'color1': 'rgba(122, 123, 118, 0.65)',
			'color9': '',
			'color3': 'rgba(193, 31, 112, 0.65)',
			'color2': 'rgba(193, 31, 112, 0.65)',
			'subtitle9': '',
			'subtitle8': '',
			'color7': '',
			'color6': 'rgba(193, 31, 112, 0.65)',
			'subtitle5': 'lastPing',
			'subtitle4': 'state',
			'subtitle7': '',
			'subtitle6': 'extra',
			'subtitle1': 'host',
			'subtitle3': 'membership',
			'subtitle2': 'strtwarns',
			'color5': 'rgba(193, 31, 112, 0.65)',
			'color4': 'rgba(193, 31, 112, 0.65)'
		}
	}
}

function genDataBoxesWidget( shardName, row ) {
	return {
      'widget': {
        'sound': false,
        'width': 1,
        'kind': 'custom_numeric_boxes4',
        'dashboard': DucksMMS.mmsDashboardSlug,
        'title': 'Shard Stats '+ shardName,
        'column': 2,
        'row': row,
        'height': 1
      },
      'slots': genBoxesSlots( shardName )
    }
}

function genBoxesSlots( shardName ) {
	return {
        '1': {
          'color': 'rgba(193, 31, 112, 0.65)',
          'subtitle': 'storage',
          'label': shardName + '_DB_STORAGE_TOTAL'
        },
        '2': {
          'color': 'rgba(193, 31, 112, 0.65)',
          'subtitle': 'memres',
          'label': shardName + '_MEMORY_RESIDENT'
        },
        '3': {
          'color': 'rgba(193, 31, 112, 0.65)',
          'subtitle': 'lock',
          'label': shardName +'_EFFECTIVE_LOCK_PERCENTAGE'
        },
        '4': {
          'color': 'rgba(193, 31, 112, 0.65)',
          'subtitle': 'flush',
          'label': shardName+'_BACKGROUND_FLUSH_AVG'
        }
      };
}

function genGraphWidget(shardName, row) {
	return {
      'widget': {
        'sound': false,
        'width': 1,
        'kind': 'custom_numeric_absolute_graph6',
        'dashboard': DucksMMS.mmsDashboardSlug,
        'title': 'Shard Ops '+ shardName,
        'column': 3,
        'row': row,
        'height': 1
      },
      'slots': getGraphSlots( shardName )
    };
}

function getGraphSlots( shardName ) {
	return {
	        '1': {
	          'color': 'rgba(75, 99, 149, 0.65)',
	          'label': shardName+ '_OPCOUNTERS_QUERY',
	          'subtitle': 'query',
	          'timespan': 'daily'
	        },
	        '2': {
	          'color': 'rgba(203, 25, 28, 0.65)',
	          'label': shardName+'_OPCOUNTERS_UPDATE',
	          'subtitle': 'update',
	          'timespan': 'daily'
	        },
	        '3': {
	          'color': 'rgba(11, 52, 2, 0.65)',
	          'label': shardName+'_OPCOUNTERS_DELETE',
	          'subtitle': 'delete',
	          'timespan': 'daily'
	        },
	        '4': {
	          'color': 'rgba(81, 0, 14, 0.65)',
	          'label': shardName+'_OPCOUNTERS_INSERT',
	          'subtitle': 'insert',
	          'timespan': 'daily'
	        },
	        '5': {
	          'color': 'rgba(176, 186, 4, 0.65)',
	          'label': shardName+'_OPCOUNTERS_GETMORE',
	          'subtitle': 'getmore',
	          'timespan': 'daily'
	        },
	        '6': {
	          'color': 'rgba(9, 9, 9, 0.65)',
	          'label': shardName+'_OPCOUNTERS_CMD',
	          'subtitle': 'cmd',
	          'timespan': 'daily'
	        }
      };
}


function ensureDashboard( masterCallBack ) {
	
	DucksMMS.requestDashboards( function( dashboards ){
		if( _.findWhere(dashboards.data, {'slug': DucksMMS.mmsDashboardSlug}) ) {
			console.log('You already have an MMS board so I will skip creating one');
			masterCallBack();
		} else {
			console.log('You do not have an MMS board so I will create one.');
			//DucksMMS.deleteDashboard( function() {
				DucksMMS.createDashboard( function () {

					DucksMMS.createWidget(eventWidget, function() {
						DucksMMS.createWidget(hostWidget, function(){ 
							DucksMMS.getDashWidgets(DucksMMS.mmsDashboardSlug, function( body ) {

								alertId = _.find(body.data, function(item){ return item.widget.title === 'MMS Alerts'; } ).widget['id'];
								hostsId = _.find(body.data, function(item){ return item.widget.title === 'Hosts'; } ).widget['id'];

								DucksMMS.ducksPut( 'https://app.ducksboard.com/api/widgets/'+alertId, {
									'slots': {
										'1': {
											'label': DucksMMS.eventsSlot
										}
									}
								}, function(data){


									DucksMMS.ducksPut( 'https://app.ducksboard.com/api/widgets/'+hostsId, {
										'slots': {
											'1': {
												'label': DucksMMS.hostsSlot
											}
										}
									}, function(data){

										async.each(
											DucksMMS.shardNames,
											function(shardName, callback ){
												//TODO row order not being respected by Ducks API when call order is unpredictable
												var index = DucksMMS.shardNames.indexOf(shardName);
												DucksMMS.createWidget( genGraphWidget(shardName, index + 1), 
													DucksMMS.createWidget( genDataBoxesWidget( shardName, index + 1 ),
														callback
													)
												);
											},
											function(err){
												console.log("Done async");
												setTimeout(function() {
													DucksMMS.getDashWidgets(DucksMMS.mmsDashboardSlug, function(body) {
														//console.log(JSON.stringify(body, undefined, 2))

														async.each(
															DucksMMS.shardNames,
															function(shardName, callback ){
																var index = DucksMMS.shardNames.indexOf(shardName);

																var graphId = _.find(body.data, function(item){ return item.widget.title === 'Shard Ops '+ shardName; } ).widget['id'];
																var boxId = _.find(body.data, function(item){ return item.widget.title === 'Shard Stats '+ shardName; } ).widget['id'];

																console.log('ShardName: '+shardName+' graphId: '+graphId+' boxId: '+boxId)

																DucksMMS.ducksPut( 'https://app.ducksboard.com/api/widgets/'+graphId , {'slots': getGraphSlots( shardName ) }, function(){
																	DucksMMS.ducksPut( 'https://app.ducksboard.com/api/widgets/'+boxId , {'slots': genBoxesSlots( shardName ) }, function(){
																		callback();
																	});
																});

																//DucksMMS.ducksPut( 'https://app.ducksboard.com/api/widgets/'+graphId, getGraphSlots( shardName ) , callback);

															},
															function(err){
																if(masterCallBack) masterCallBack();
															}
														);
													})
												}, 4000);

											}
										);


									})
								});

							})
						});
					});
				});
			//});
		}
	});
	
	
	
}




//setInterval(ping, DucksMMS.pingInterval);
//ping();

//DucksMMS.getDashWidgets('main-dashboard');
//DucksMMS.getDashWidgets(DucksMMS.mmsDashboardSlug, function(body){console.log(body);});

ensureDashboard(function(){
	ping();
	//setInterval(ping, DucksMMS.pingInterval);
});

//DucksMMS.deleteDashboard( function() { console.log("Done"); });
