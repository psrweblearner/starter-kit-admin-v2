'use strict';

const express = require('express');
const app = express();
const dotenv = require('dotenv');
dotenv.config({ path: './.env' });
const path = require('path');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const http = require('http');
const PORT = process.env.PORT || 4000;
const exphbs = require('express-handlebars');
const layoutHelper = require('./helper/layout');

/* 
============================================================
                 BASIC APPLICATION MIDDLEWARE
============================================================
This section loads all core middleware required by the server.
It includes CORS for cross-origin requests, Body-Parser for 
handling JSON & form data, Cookie Parser for cookies, and a 
custom Request Context middleware which attaches a unique 
request ID and contextual data to every incoming request. 
The global activity logger is also attached here, ensuring 
that authentication events and CRUD actions are recorded 
for auditing and monitoring purposes. 
============================================================
*/
app.use(bodyParser.urlencoded({ limit: '500mb', extended: false }));
app.use(bodyParser.json({ limit: '500mb' }));
app.use(cookieParser());

// ✅ Fix for Auto-Logout (IP Mismatch)
app.set('trust proxy', true);

/* 
============================================================
                       STATIC FILES
============================================================
This section defines the directory that Express will use 
to serve all publicly accessible static files such as CSS, 
JavaScript assets, front-end libraries, uploads, and any 
other resources required by the browser.
============================================================
*/
const staticPath = path.join(__dirname, './public');
app.use(express.static(staticPath));

/* 
============================================================
                ATTACHING URL TO VIEW LOCALS
============================================================
Before rendering any view, this middleware makes the 
requested URL available in res.locals. This is extremely 
useful for dynamic styling, making menu items active, 
tracking navigation flow, or performing conditional UI 
changes based on the current route.
============================================================
*/
app.use((req, res, next) => {
    res.locals.url = req.originalUrl;
    next();
});

/* 
============================================================
                HANDLEBARS TEMPLATE ENGINE
============================================================
The application uses Handlebars (HBS) as its template engine.
This block registers the engine, defines the default layout, 
specifies the location of layouts and partials, and connects 
custom helpers that extend template functionality. All views 
inside /resources will use this configuration.
============================================================
*/

app.engine('hbs', exphbs.engine({
    extname: '.hbs',
    defaultLayout: 'v1/layouts/main',
    layoutsDir: path.join(__dirname, 'resources'),
    partialsDir: path.join(__dirname, 'resources/v1/partials'),
    helpers: layoutHelper,
}));

app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'resources'));

/* 
============================================================
                    APPLICATION ROUTES
============================================================
This section mounts all API and web routes used by the 
application. Public APIs are served under `/api`, admin APIs 
under `/admin-api`, admin UI pages under `/admin`, and the 
main website routes under `/`. This creates a clean separation 
between public, administrative, and front-facing modules.
============================================================
*/
app.use('/', require('./routes/v1/route'));

/* 
============================================================
                        404 HANDLER
============================================================
If no route matches the incoming request, this block renders 
a custom 404 page. The layout is disabled to avoid nested 
layouts and ensure the error page renders cleanly.
============================================================
*/
app.use((req, res) => {
    res.status(404).render('v1/errors/404', { layout: false });
});


/* 
============================================================
                      ERROR HANDLING
============================================================
This middleware catches server-side errors generated during 
route execution. Instead of crashing the server, it returns 
a 500 response with the error message (or stack trace in 
development mode). This prevents unexpected application 
breakdowns and improves debugging efficiency.
============================================================
*/
app.use((err, req, res, next) => {
    res.status(500).send(err);
});


/* 
============================================================
                    STARTING THE SERVER
============================================================
The HTTP server is created using Express and starts listening 
on the configured port. Once active, the console displays the 
server URL for easy access during development or debugging.
============================================================
*/
const server = http.createServer(app);
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
