var mms2ducks = require('./mms2ducks').mms2ducks;

// on startup create the dashboard if it isn't there
mms2ducks.ensureDashboard(function(){

	// immediately refresh status
	mms2ducks.ping();
	
	// refresh the status every X miliseconds
	setInterval(
		mms2ducks.ping, 
		mms2ducks.pingInterval
	);
});


