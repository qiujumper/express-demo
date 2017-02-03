var express = require('express'),
	fortune = require('./lib/fortune.js'),
    mongoose = require('mongoose'),
    fs = require('fs'),
    Vacation = require('./models/vacation.js'),
    VacationInSeasonListener = require('./models/vacationInSeasonListener.js'),
    rest = require('connect-rest'),
	formidable = require('formidable');

var app = express();



var credentials = require('./credentials.js');

var emailService = require('./lib/email.js')(credentials);

//start initializing code
//connect mongoose
var opts = {
    server: {
        socketOptions: {keepAlive: 1}
    }
};

var apiOptions = {
    context: '/api',
    domain: require('domain').create(),
};

app.use(rest.rester(apiOptions));

var Attraction = require('./models/attraction.js');

var MongoSessionStore = require('session-mongoose')(require('connect'));
var sessionStore = new MongoSessionStore({
    url: credentials.mongo.development.connectionString
});

mongoose.connect(credentials.mongo.development.connectionString, opts);

// set up handlebars view engine
var handlebars = require('express3-handlebars').create({
    defaultLayout:'main',
    helpers: {
        section: function(name, options){
            if(!this._sections) this._sections = {};
            this._sections[name] = options.fn(this);
            return null;
        }
    }
});
app.engine('handlebars', handlebars.engine);
app.set('view engine', 'handlebars');

app.set('port', process.env.PORT || 3000);

app.use(require('cookie-parser')(credentials.cookieSecret));
app.use(require('express-session')({
    resave: false,
    saveUninitialized: false,
    secret: credentials.cookieSecret,
    store: sessionStore,
}));app.use(express.static(__dirname + '/public'));
app.use(require('body-parser')());

switch(app.get('env')){
    case 'development':
        app.use(require('morgan')('dev')); 
        break;

    case 'production':
        app.use(require('express-logger')({
            path: __dirname + '/log/requests.log'
        }));
        
        break;
}

rest.get('/attractions', function(req, content, cb){
    Attraction.find({ approved: true }, function(err, attractions){
        if(err) return cb({ error: 'Internal error.' });
        cb(null, attractions.map(function(a){
            return {
                name: a.name,
                description: a.description,
                location: a.location,
            };
        }));
    });
});

rest.post('/attraction', function(req, content, cb){
    console.log('i am here');
    var a = new Attraction({
        name: req.body.name,
        description: req.body.description,
        location: { lat: req.body.lat, lng: req.body.lng },
        history: {
            event: 'created',
            email: req.body.email,
            date: new Date(),
        },
        approved: false,
    });
    a.save(function(err, a){
        if(err) return cb({ error: 'Unable to add attraction.' });
        cb(null, { id: a._id });
    }); 
});

rest.get('/attraction/:id', function(req, content, cb){
    Attraction.findById(req.params.id, function(err, a){
        if(err) return cb({ error: 'Unable to retrieve attraction.' });
        cb(null, { 
            name: a.name,
            description: a.description,
            location: a.location,
        });
    });
});

// flash message middleware
app.use(function(req, res, next){
	// if there's a flash message, transfer
	// it to the context, then clear it
	res.locals.flash = req.session.flash;
	delete req.session.flash;
	next();
});

//add cross share
app.use('/api', require('cors')());

// set 'showTests' context property if the querystring contains test=1
app.use(function(req, res, next){
	res.locals.showTests = app.get('env') !== 'production' && 
		req.query.test === '1';
	next();
});

// mocked weather data
function getWeatherData(){
    return {
        locations: [
            {
                name: 'Portland',
                forecastUrl: 'http://www.wunderground.com/US/OR/Portland.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/cloudy.gif',
                weather: 'Overcast',
                temp: '54.1 F (12.3 C)',
            },
            {
                name: 'Bend',
                forecastUrl: 'http://www.wunderground.com/US/OR/Bend.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/partlycloudy.gif',
                weather: 'Partly Cloudy',
                temp: '55.0 F (12.8 C)',
            },
            {
                name: 'Manzanita',
                forecastUrl: 'http://www.wunderground.com/US/OR/Manzanita.html',
                iconUrl: 'http://icons-ak.wxug.com/i/c/k/rain.gif',
                weather: 'Light Rain',
                temp: '55.0 F (12.8 C)',
            },
        ],
    };
}

// middleware to add weather data to context
app.use(function(req, res, next){
	if(!res.locals.partials) res.locals.partials = {};
 	res.locals.partials.weatherContext = getWeatherData();
 	next();
});

app.get('/', function(req, res) {
	res.render('home');
});
app.get('/about', function(req,res){
	res.render('about', { 
		fortune: fortune.getFortune(),
		pageTestScript: '/qa/tests-about.js' 
	} );
});
app.get('/tours/request-group-rate', function(req, res){
	res.render('tours/request-group-rate');
});
app.get('/jquery-test', function(req, res){
	res.render('jquery-test');
});
app.get('/nursery-rhyme', function(req, res){
	res.render('nursery-rhyme');
});
app.get('/data/nursery-rhyme', function(req, res){
	res.json({
		animal: 'squirrel',
		bodyPart: 'tail',
		adjective: 'bushy',
		noun: 'heck',
	});
});
app.get('/thank-you', function(req, res){
	res.render('thank-you');
});
app.get('/newsletter', function(req, res){
	res.render('newsletter');
});

// for now, we're mocking NewsletterSignup:
function NewsletterSignup(){
}
NewsletterSignup.prototype.save = function(cb){
	cb();
};

// mocking product database
function Product(){
}
Product.find = function(conditions, fields, options, cb){
	if(typeof conditions==='function') {
		cb = conditions;
		conditions = {};
		fields = null;
		options = {};
	} else if(typeof fields==='function') {
		cb = fields;
		fields = null;
		options = {};
	} else if(typeof options==='function') {
		cb = options;
		options = {};
	}
	var products = [
		{
			name: 'Hood River Tour',
			slug: 'hood-river',
			category: 'tour',
			maximumGuests: 15,
			sku: 723,
		},
		{
			name: 'Oregon Coast Tour',
			slug: 'oregon-coast',
			category: 'tour',
			maximumGuests: 10,
			sku: 446,
		},
		{
			name: 'Rock Climbing in Bend',
			slug: 'rock-climbing/bend',
			category: 'adventure',
			requiresWaiver: true,
			maximumGuests: 4,
			sku: 944,
		}
	];
	cb(null, products.filter(function(p) {
		if(conditions.category && p.category!==conditions.category) return false;
		if(conditions.slug && p.slug!==conditions.slug) return false;
		if(isFinite(conditions.sku) && p.sku!==Number(conditions.sku)) return false;
		return true;
	}));
};
Product.findOne = function(conditions, fields, options, cb){
	if(typeof conditions==='function') {
		cb = conditions;
		conditions = {};
		fields = null;
		options = {};
	} else if(typeof fields==='function') {
		cb = fields;
		fields = null;
		options = {};
	} else if(typeof options==='function') {
		cb = options;
		options = {};
	}
	Product.find(conditions, fields, options, function(err, products){
		cb(err, products && products.length ? products[0] : null);
	});
};

var VALID_EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

app.post('/newsletter', function(req, res){
	var name = req.body.name || '', email = req.body.email || '';
	// input validation
	if(!email.match(VALID_EMAIL_REGEX)) {
		if(req.xhr) return res.json({ error: 'Invalid name email address.' });
		req.session.flash = {
			type: 'danger',
			intro: 'Validation error!',
			message: 'The email address you entered was  not valid.',
		};
		return res.redirect(303, '/newsletter/archive');
	}
	new NewsletterSignup({ name: name, email: email }).save(function(err){
		if(err) {
			if(req.xhr) return res.json({ error: 'Database error.' });
			req.session.flash = {
				type: 'danger',
				intro: 'Database error!',
				message: 'There was a database error; please try again later.',
			};
			return res.redirect(303, '/newsletter/archive');
		}
		if(req.xhr) return res.json({ success: true });
		req.session.flash = {
			type: 'success',
			intro: 'Thank you!',
			message: 'You have now been signed up for the newsletter.',
		};
		return res.redirect(303, '/newsletter/archive');
	});
});
app.get('/newsletter/archive', function(req, res){
	res.render('newsletter/archive');
});

app.get('/notify-me-when-in-season', function(req, res){
    res.render('notify-me-when-in-season', {sku: req.query.sku});
});

app.post('/notify-me-when-in-season', function(req, res){
    VacationInSeasonListener.update(
        {email: req.body.email},
        {$push: {sku: req.body.sku}},
        {upsert: true},
        function(err){
            if(err){
                console.log(err.stack);
                req.session.flash = {
                    type: 'danger',
                    intro: 'Oppps',
                    message: 'There was an error processing your request.'
                };
                return res.redirect(303, '/vacations');
            }
            req.session.flash = {
                type: 'success',
                intro: 'Thank you!',
                message: 'You will be notified when this vacation is in season.',
            };
            return res.redirect(303, '/vacations');
        }
    );
});
app.get('/contest/vacation-photo', function(req, res){
    var now = new Date();
    res.render('contest/vacation-photo', { year: now.getFullYear(), month: now.getMonth() });
});
app.post('/contest/vacation-photo/:year/:month', function(req, res){
    var form = new formidable.IncomingForm();
    form.parse(req, function(err, fields, files){
        if(err) return res.redirect(303, '/error');
        console.log('received fields:');
        console.log(fields);
        console.log('received files:');
        console.log(files);
        res.redirect(303, '/thank-you');
    });
});
app.get('/vacation/:vacation', function(req, res, next){
    Vacation.findOne({ slug: req.params.vacation }, function(err, vacation){
        if(err) return next(err);
        if(!vacation) return next();
        res.render('vacation', { vacation: vacation });
    });
});
app.get('/adventures/:subcat/:name', function(req, res, next){
	Product.findOne({ category: 'adventure', slug: req.params.subcat + '/' + req.params.name  }, function(err, adventure){
		if(err) return next(err);
		if(!adventure) return next();
		res.render('adventure', { adventure: adventure });
	});
});

var cartValidation = require('./lib/cartValidation.js');

app.use(cartValidation.checkWaivers);
app.use(cartValidation.checkGuestCounts);

app.post('/cart/add', function(req, res, next){
    console.log('here');
    var cart = req.session.cart || (req.session.cart = { items: [] });
    Vacation.findOne({ sku: req.body.sku }, function(err, vacation){
        if(err) return next(err);
        if(!vacation) return next(new Error('Unknown vacation SKU: ' + req.body.sku));
        cart.items.push({
            vacation: vacation,
            guests: req.body.guests || 1,
        });console.log(cart); console.log('good to go');
        res.redirect(303, '/cart');
    });
});

app.get('/cart/add', function(req, res, next){
    var cart = req.session.cart || (req.session.cart = { items: [] });
    Vacation.findOne({ sku: req.query.sku }, function(err, vacation){console.log('hereee');
        if(err) return next(err);console.log('noot here?');
        if(!vacation) return next(new Error('Unknown vacation SKU: ' + req.query.sku));
        cart.items.push({
            vacation: vacation,
            guests: req.body.guests || 1,
        });console.log(cart);
        res.redirect(303, '/cart');
    });
});


app.get('/cart', function(req, res, next){
	var cart = req.session.cart;
	if(!cart) next();
	res.render('cart', { cart: cart });
});
app.get('/cart/checkout', function(req, res, next){
	var cart = req.session.cart;
	if(!cart) next();
	res.render('cart-checkout');
});
app.get('/cart/thank-you', function(req, res){
	res.render('cart-thank-you', { cart: req.session.cart });
});
app.get('/email/cart/thank-you', function(req, res){
	res.render('email/cart-thank-you', { cart: req.session.cart, layout: null });
});
app.post('/cart/checkout', function(req, res){
	var cart = req.session.cart;
	if(!cart) next(new Error('Cart does not exist.'));
	var name = req.body.name || '', email = req.body.email || '';
	// input validation
	if(!email.match(VALID_EMAIL_REGEX)) return res.next(new Error('Invalid email address.'));
	// assign a random cart ID; normally we would use a database ID here
	cart.number = Math.random().toString().replace(/^0\.0*/, '');
	cart.billing = {
		name: name,
		email: email,
	};
    res.render('email/cart-thank-you', 
    	{ layout: null, cart: cart }, function(err,html){
	        if( err ) console.log('error in email template');
	        emailService.send(cart.billing.email,
	        	'Thank you for booking your trip with Meadowlark Travel!',
	        	html);
	    }
    );
    res.render('cart-thank-you', { cart: cart });
});

//vacation from mongoose
app.get('/vacations', function(req, res){
    Vacation.find({ available: true }, function(err, vacations){
        var currency = req.session.currency || 'USD';
        var context = {
            currency: currency,
            vacations: vacations.map(function(vacation){
                return {
                    sku: vacation.sku,
                    name: vacation.name,
                    description: vacation.description,
                    inSeason: vacation.inSeason,
                    price: convertFromUSD(vacation.priceInCents/100, currency).toFixed(2),
                    qty: vacation.qty,
                };
            })
        };
        switch(currency){
            case 'USD': context.currencyUSD = 'selected'; break;
            case 'GBP': context.currencyGBP = 'selected'; break;
            case 'BTC': context.currencyBTC = 'selected'; break;
        }
        res.render('vacations', context);
    });
});

//currency
app.get('/set-currency/:currency', function(req, res){
    req.session.currency = req.params.currency;
    return res.redirect(303, '/vacations');
});

function convertFromUSD(value, currency){
    switch(currency){
        case 'USD': return value * 1;
        case 'GBP': return value * 0.6;
        case 'BTC': return value * 0.0023707918444761;
        default: return NaN;
    }
}
//test route
app.get('/foo',
    function(req,res,next){
        if(Math.random() < 0.33) return next();
        res.send('red');
    },
    function(req, res, next){
        if (Math.random() < 0.5) return next();
        res.send('green');
    },
    function(req, res){
        res.send('blue');
    }
);

//use authorize as midware
function authorize(req, res, next){
    if (req.session.authorize) {
        return next();
    }
    res.send('not authorized:(');
}

app.get('/secret', authorize, function(){
    res.send('I want to see secret');
});
//uncaught exceptions
app.get('/fail', function(req, res){
    throw new Error('yes me lord!');
});

//this might shut down server
app.get('/epic-fail', function(){
    process.nextTick(function(){
        throw new Error('Hooooo!');
    });
});

// add support for auto views
var autoViews = {};

app.use(function(req,res,next){ 
    var path = req.path.toLowerCase();  
    // check cache; if it's there, render the view
    if(autoViews[path]) return res.render(autoViews[path]);
    // if it's not in the cache, see if there's
    // a .handlebars file that matches
    if(fs.existsSync(__dirname + '/views' + path + '.handlebars')){
        autoViews[path] = path.replace(/^\//, '');
        return res.render(autoViews[path]);
    }
    // no view found; pass on to 404 handler
    next();
});

// 404 catch-all handler (middleware)
// there is no err param for 404
app.use(function(req, res, next){
	res.status(404);
	res.render('404');
});

// 500 error handler (middleware)
app.use(function(err, req, res, next){
	console.error(err.stack);
	res.status(500);
	res.render('500');
});

app.listen(app.get('port'), function(){
  console.log( 'Express started on http://localhost:' + 
    app.get('port') + '; press Ctrl-C to terminate.' );
});
