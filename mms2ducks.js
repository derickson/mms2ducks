

// import libraries for handling REST
var request = require('request'); //https://github.com/request/request

// libraries for async looping and working with JSON lists
var _ = require('underscore');
var async = require('async');

// separate config file (so I don't have to put my passwords and settings in Github)
var config = require('./configStuff').config;

// the main object
var mms2ducks = {
	
	
	// items loaded from config file
	'pingInterval': config.pingInterval,
	
	'MMSusername' : config.MMSusername,
	'MMSpassword' : config.MMSpassword,
	'MMSurl' : config.MMSurl,
	
	'DucksApiKey' : config.DucksApiKey,
	'DucksUsername': config.DucksUsername,
	'DucksPassword': config.DucksPassword,
	
	'shardNames' : config.shardNames,
	
	// standard names
	'eventsSlot': 'mongo_mms_events',
	'hostsSlot': 'mongo_mms_hosts',
	'statusSlot': 'mongo_mms_status',
	'textSlot': 'mongo_mms_text',
	'mmsDashboardName': 'Mongo MMS',
	'mmsDashboardSlug': 'mongo-mms',
	
	'masterStatusCodes': { //https://dev.ducksboard.com/apidoc/slot-kinds/#status
		'OK': 0,
		'ERROR': 1,
		'WARNING': 2,
		'UNKNOWN': 3
	},
	
	// stateful variables
	'lastDataTime' : {},
	
	// utility call to execute a GET from MMS
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
	
	// utility call to execute a GET from ducksboard
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
	
	// utility call to execute a POST to ducksboard
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
		
	},
	
	// utility call to execute a DELETE to ducksboard
	'ducksDelete': function( url , cb ){
		var options = {
			'auth': {
				'user': this.DucksApiKey,
				'pass': 'notused'
			},
			'json':true
		};
		
		request.del(url, options).on('response', function(response){			
			if(response.statusCode !== 200){
				console.error('error clearing events');
				console.log( response.statusCode);
				console.log( response.body );
			} 
			if(cb) {
				cb();
			}
		});
	},
	
	// utility call to execute a PUT to ducksboard
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
	
	// GET the alerts feed from MMS.  Recursive call targeting latest alerts only
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
						
						mms2ducks.pullAlerts( groupId, items, targetPageNum, cb);
						mms2ducks.pullAlerts( groupId, items, targetPageNum2, cb);
						
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
	
	// GET hosts information for the group and cluster from MMS
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

	// given the mms data for a host currently acting as a replica set primary, get MMS metrics and continue processing to ducksboard
	'pullStatsForPrimary': function( primary ) {
		var curSecs = new Date().getTime()/1000;
		var lastPointSecs = new Date(primary.lastPing).getTime()/1000;
		mms2ducks.mmsGet( primary.links[0].href + '/metrics', function( body ){
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
							//	item.metricName === 'DB_DATA_SIZE_TOTAL'||
								item.metricName === 'MEMORY_RESIDENT'|| 
								item.metricName === 'EFFECTIVE_LOCK_PERCENTAGE'|| 
								item.metricName === 'BACKGROUND_FLUSH_AVG');
				}), 
				function(item, callback){
					mms2ducks.mmsGet(item.links[0].href, function(metric){
						async.each(
							_.filter(metric.dataPoints, function(point){
								var pointSecs = new Date(point.timestamp).getTime()/1000;
								var key = primary.replicaSetName + '_' + item.metricName;
								var tooOld = pointSecs < mms2ducks.lastDataTime[key] ? mms2ducks.lastDataTime[key] : 0;
								
								if( !tooOld ){
									mms2ducks.lastDataTime[key] = pointSecs;
									return true;
								} else {
									return false;
								}
								
								//return  (curSecs - pointSecs  <= curSecs - lastPointSecs + 120);
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
						mms2ducks.pushPrimaryMetrics(primaryStats);
						
					} else {
						console.error(err)
					}
				}
			);
		});
	},
	
	// given the list of retrieved metrics for a primary server, push data to ducksbaord
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
				
				var val = dataPoint.value;
				if( dataPoint.metric === 'EFFECTIVE_LOCK_PERCENTAGE' ){
					val = val.toPrecision(2);
				}
				
				payload[stat].push({
					'timestamp': dataPoint.timestamp,
					'value': val
				});
				callback();
			},
			function(err){
				if(!err) {
					mms2ducks.pushEndpoint( payload, '' );
					//printSlot( payload, '_' );
					//console.log(payload);
				} else {
					console.error(err);
				}
			}
		);
	},
	
	// POST data to a ducksboard slot endpoint
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
	
	// remove the data from a ducksboard 'slot'
	'clearDucksData': function( endpoint, cb ) {
		var url = 'https://push.ducksboard.com';
		var path = '/values/' + endpoint;
		
		mms2ducks.ducksDelete( url + path, cb );
	},
	
	// given alerts data from MMS, process and send data for events to ducksboard
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
				
				mms2ducks.pushEndpoint( duckAlert , mms2ducks.eventsSlot);
				//printSlot(duckAlert, mms2ducks.eventsSlot);

			},
			function(err){
				if(!err){
					

				} else {
					console.error(err)
				}
			}
		);
	},
	
	// given the cluster hosts data from MMS, process and send data for hosts and stats data to ducksboard
	'interpMMSCluster' : function(cluster){

		var masterStatus = mms2ducks.masterStatusCodes.UNKNOWN;

		var board = [];
		var curSecs = new Date().getTime()/1000;
		
		var repSets = {};

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
					mms2ducks.pullStatsForPrimary( result );
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

				// tracking existence of primary in each replicaSet for purpose of Master Status tracking
				if(typeChar === 'D') {
					if( repSets[shardMembership] ) {
						if(isPrimary) repSets[shardMembership] = 'primary';
					} else {
						if(isPrimary) { repSets[shardMembership] = 'primary'; } else { repSets[shardMembership] = 'exists'; }	
					}
					//console.log( 'shard: '+shardMembership+' set to --> '+ repSets[shardMembership]);
				}


				var lastPing = new Date(result.lastPing).getTime()/1000;
				var lastPingAge = curSecs - lastPing;
				var lastPingAgeColor = 
					lastPingAge > 300 ? 'red' :
						lastPingAge > 180 || (result.replicaStateName && result.replicaStateName === 'DOWN' )? 'yellow' :
						lastPingAge > 0 ? 'green' : 'gray';
				
				// age of ping or host down is a WARNING level master status problem
				if( lastPingAge === 'yellow' ) {
					masterStatus = mms2ducks.masterStatusCodes.WARNING;
				}

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

					//interp master status
					//console.log(pretty(repSets));
					//console.log(masterStatus);
					var primaryCount = 0;
					for(repSet in repSets){
						if(repSets[repSet] === 'exists'){
							masterStatus = mms2ducks.masterStatusCodes.ERROR;
						} else if(repSets[repSet] === 'primary'){
							primaryCount++;
						}
					}
					masterStatus = (masterStatus === mms2ducks.masterStatusCodes.UNKNOWN && primaryCount > 0) ? mms2ducks.masterStatusCodes.OK : masterStatus;
					var statusPayload = {
						'timestamp': curSecs,
						'value': masterStatus
					};
					mms2ducks.pushEndpoint( statusPayload, mms2ducks.statusSlot );
					//printSlot(statusPayload, mms2ducks.statusSlot);
					
					mms2ducks.pushEndpoint( duckPayload , mms2ducks.hostsSlot);
					//printSlot(duckPayload, mms2ducks.hostsSlot);


				} else {
					console.error(err)
				}
			}
		);

	},
	
	// get all the currently defined dashboards for a ducksboard account
	'requestDashboards': function(cb) {
		var url = 'https://app.ducksboard.com';
		var path = '/api/dashboards';
		
		mms2ducks.ducksGet( url + path, function( body ) {
			//console.log(body);
			if(cb) cb(body);
		});
	},
	
	// utlity function to delete the mms dashboard
	'deleteDashboard': function(cb) {
		console.log("Deleting Dashboard");
		var url = 'https://app.ducksboard.com';
		var path = '/api/dashboards/' + mms2ducks.mmsDashboardSlug;
		
		mms2ducks.ducksDelete(url + path, cb);
	},
	
	// create an empty dashboard for mms data
	'createDashboard': function(cb) {
		console.log("Creating Dashboard");
		var url = 'https://app.ducksboard.com';
		var path = '/api/dashboards/';
		
		var dash = {
			name: mms2ducks.mmsDashboardName,
			background: 'white'
		};
		
		mms2ducks.ducksPost( url + path, dash, cb);
	},
	
	// utility function to get all the widgets for a widgets for a dashboard with the provided slug
	'getDashWidgets': function(slug, cb) {
		var url = 'https://app.ducksboard.com';
		var path = '/api/dashboards/'+slug+'/widgets/';
		
		mms2ducks.ducksGet( url + path, function( body ) {
			//console.log(JSON.stringify(body, undefined, 2));
			if(cb) {
				cb( body );
			}
		});
	},
	
	// utility function to create a ducksboard widget
	'createWidget': function( widget, cb ) {		
		mms2ducks.ducksPost( 'https://app.ducksboard.com/api/widgets/',  widget, cb);
	},
	

	
	// publicly exposed function which updates the status of the ducksboard from MMS API DATA
	'ping': function () {
		// the hosts and metrics data
		mms2ducks.pullCluster(config.MMSgroupId, config.MMSclusterId, mms2ducks.interpMMSCluster);

		// the alerts (events) data
		mms2ducks.clearDucksData(mms2ducks.eventsSlot, function() {
			mms2ducks.pullAlerts(config.MMSgroupId, 100, 1, mms2ducks.interpMMSAlerts);
		});
	}, // end ping()


	// publicly exposed function to make sure the dashboard exists
	'ensureDashboard': function ( masterCallBack ) {

		mms2ducks.requestDashboards( function( dashboards ){
			if( _.findWhere(dashboards.data, {'slug': mms2ducks.mmsDashboardSlug}) ) {
				console.log('You already have an MMS board so I will skip creating one');
				masterCallBack();
			} else {
				console.log('You do not have an MMS board so I will create one.');

					mms2ducks.createDashboard( function () {

						mms2ducks.createWidget(eventWidget, function() {
							mms2ducks.createWidget(hostWidget, function(){ 
								mms2ducks.createWidget(textWidget, function() {
									mms2ducks.createWidget(statusWidget, function(){

										mms2ducks.getDashWidgets(mms2ducks.mmsDashboardSlug, function( body ) {

											alertId = _.find(body.data, function(item){ return item.widget.title === 'MMS Alerts'; } ).widget['id'];
											hostsId = _.find(body.data, function(item){ return item.widget.title === 'Hosts'; } ).widget['id'];
											statusId = _.find(body.data, function(item){ return item.widget.title === statusWidget.widget.title; } ).widget['id'];
											textId = _.find(body.data, function(item){ return item.widget.title === textWidget.widget.title; } ).widget['id'];

											mms2ducks.ducksPut( 'https://app.ducksboard.com/api/widgets/'+alertId, {
												'slots': {
													'1': {
														'label': mms2ducks.eventsSlot
													}
												}
											}, function(data){


												mms2ducks.ducksPut( 'https://app.ducksboard.com/api/widgets/'+hostsId, {
													'slots': {
														'1': {
															'label': mms2ducks.hostsSlot
														}
													}
												}, function(data){

													mms2ducks.ducksPut( 'https://app.ducksboard.com/api/widgets/'+statusId, {
														'slots': {
															'1': {
																'label': mms2ducks.statusSlot
															}
														}
													}, function(data){

														mms2ducks.ducksPut( 'https://app.ducksboard.com/api/widgets/'+textId, {
															'slots': {
																'1': {
																	'label': mms2ducks.textSlot
																}
															}
														}, function(data){



															async.each(
																mms2ducks.shardNames,
																function(shardName, callback ){
																	//TODO row order not being respected by Ducks API when call order is unpredictable
																	var index = mms2ducks.shardNames.indexOf(shardName);
																	mms2ducks.createWidget( genGraphWidget(shardName, index + 1), 
																		mms2ducks.createWidget( genDataBoxesWidget( shardName, index + 1 ),
																			callback
																		)
																	);
																},
																function(err){
																	console.log("Done async");
																	setTimeout(function() {
																		mms2ducks.getDashWidgets(mms2ducks.mmsDashboardSlug, function(body) {
																			//console.log(JSON.stringify(body, undefined, 2))

																			async.each(
																				mms2ducks.shardNames,
																				function(shardName, callback ){
																					var index = mms2ducks.shardNames.indexOf(shardName);

																					var graphId = _.find(body.data, function(item){ return item.widget.title === 'Shard Ops '+ shardName; } ).widget['id'];
																					var boxId = _.find(body.data, function(item){ return item.widget.title === 'Shard Stats '+ shardName; } ).widget['id'];

																					console.log('ShardName: '+shardName+' graphId: '+graphId+' boxId: '+boxId)

																					mms2ducks.ducksPut( 'https://app.ducksboard.com/api/widgets/'+graphId , {'slots': getGraphSlots( shardName ) }, function(){
																						mms2ducks.ducksPut( 'https://app.ducksboard.com/api/widgets/'+boxId , {'slots': genBoxesSlots( shardName ) }, function(){
																							callback();
																						});
																					});

																					//mms2ducks.ducksPut( 'https://app.ducksboard.com/api/widgets/'+graphId, getGraphSlots( shardName ) , callback);

																				},
																				function(err){
																					if(masterCallBack) masterCallBack();
																				}
																			);
																		})
																	}, 4000);

																}
															);
														});
													});
												});
											});

										})
									});
								});
							});
						});
					});
			} // end if dashboard doesn't exist
		});	
	}// end ensureDashboard()

	
};

// widgets ... note that ids and labels are missing or wrong.  
// The ensureDashboard code edits the labels of the slots after the fact to make sure they are correct.

var eventWidget =
{
	'widget': {
		'sound': false,
		'width': 1,
		'kind': 'custom_textual_timeline',
		'dashboard': mms2ducks.mmsDashboardSlug,
		'title': 'MMS Alerts',
		'column': 1,
		'row': 1,
		'height': 4
	},
		'slots': {
			'1': {
		'		label': mms2ducks.eventsSlot
			}
	}
};

var hostWidget =
{
	'widget': {
		'sound': false,
		'width': 2,
		'kind': 'custom_textual_status_leaderboard5',
		'dashboard': mms2ducks.mmsDashboardSlug,
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
};

var textWidget =
{
	"widget": {
		"sound": false,
		"width": 1,
		"kind": "custom_textual_text",
		"dashboard": mms2ducks.mmsDashboardSlug,
		"title": "Notes",
		"column": 3,
		"row": 1,
		"height": 1
	},
	"slots": {
		"1": {
			"label": "615972"
		}
	}

};

var statusWidget =
{
	"widget": {
		"sound": false,
		"width": 1,
		"kind": "custom_textual_status",
		"dashboard": mms2ducks.mmsDashboardSlug,
		"title": "MongoDB Master Status",
		"column": 2,
		"row": 1,
		"height": 1
	},
	"slots": {
		"1": {
			"color": "rgba(59, 121, 10, 0.65)",
			"subtitle": "MongoDB Master Status",
			"label": "615973"
		}
	}
};


function genDataBoxesWidget( shardName, row ) {
	return {
      'widget': {
        'sound': false,
        'width': 1,
        'kind': 'custom_numeric_boxes4',
        'dashboard': mms2ducks.mmsDashboardSlug,
        'title': 'Shard Stats '+ shardName,
        'column': 2,
        'row': row + 1,
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
        'dashboard': mms2ducks.mmsDashboardSlug,
        'title': 'Shard Ops '+ shardName,
        'column': 3,
        'row': row + 1,
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



// utility console.logging calls
function pretty( payload ){
	return JSON.stringify(payload, undefined, 2);
}

function printPayload( payload ) {
	console.log( pretty( payload ) );
}

function printSlot( payload, slot ){
	console.log("POST to slot: "+ slot );
	console.log( pretty ( payload ) );
}


// the parts of the library which are publicly exposed
exports.mms2ducks = {
	// the status refresh
	'ping' : mms2ducks.ping,
	
	// checks to make sure the dashboard exists
	'ensureDashboard': mms2ducks.ensureDashboard,
	
	// the current config for the pingInterval in milliseconds
	'pingInterval': mms2ducks.pingInterval
};


//mms2ducks.getDashWidgets('main-dashboard');
//mms2ducks.getDashWidgets(mms2ducks.mmsDashboardSlug, function(body){console.log(pretty(body));});
//mms2ducks.deleteDashboard( function() { console.log("Done"); });
//mms2ducks.clearDucksData( mms2ducks.hostsSlot, function() { console.log("Done"); });
