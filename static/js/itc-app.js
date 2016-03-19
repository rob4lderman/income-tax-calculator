angular.module( "ItcApp", [] )

/**
 * TODO
 */
.controller( "MainController", [ "$scope", "Logger", "TheCanvas", "Projector", "TaxRates",
                         function($scope,   Logger,   TheCanvas,   Projector,   TaxRates) {

    var logger = Logger.getLogger("MainController", {all: true} );
    logger.info("alive!");


    /**
     * Refresh the view.
     */
    var onFormSubmit = function() {

        refreshCanvas( processForm() );

    };

    /**
     * Process the form data and return a data object containing the relevant
     * bits needed to render the canvas.
     *
     * @return data object
     */
    var processForm = function() {

        var retMe = {
            agi: parseFloat( $scope.inputWages ) 
                          + parseFloat( $scope.inputInterestIncome ) 
                          + parseFloat( $scope.inputDividendIncome ),

            medicareWages: parseFloat($scope.inputMedicareWages),

            socialSecurityWages: parseFloat($scope.inputSsWages),

            totalTaxWithheld: parseFloat( $scope.inputIncomeTaxWithheld )
                                    + parseFloat( $scope.inputSsTaxWithheld )
                                    + parseFloat( $scope.inputMedicareTaxWithheld ),

            totalDeduction: parseFloat( $scope.inputDeduction )
                                    + TaxRates.deductions.personalexemption

        };

        retMe.taxableAgi = retMe.agi - retMe.totalDeduction;

        retMe.totalIncome = retMe.medicareWages 
                                    + parseFloat( $scope.inputInterestIncome ) 
                                    + parseFloat( $scope.inputDividendIncome );

        // compute taxes.
        retMe.incomeTax = _.reduce(TaxRates.getBrackets( retMe.taxableAgi ), 
                                   function( memo, bracket ) { return memo + TaxRates.getTaxedAmount(bracket, retMe.taxableAgi ); }, 
                                   0 );
        retMe.socialSecurityTax = TaxRates.getTaxedAmount( TaxRates.socialsecurity.single, retMe.socialSecurityWages );
        retMe.medicareTax = TaxRates.getTaxedAmount( TaxRates.medicare.single, retMe.medicareWages );

        retMe.totalTax = retMe.incomeTax + retMe.socialSecurityTax + retMe.medicareTax;

        logger.fine("processForm: $scope=" + JSON.stringify( _.pick($scope, [ "inputWages",
                                                                              "inputSsWages",
                                                                              "inputMedicareWages",
                                                                              "inputIncomeTaxWithheld",
                                                                              "inputSsTaxWithheld",
                                                                              "inputMedicareTaxWithheld" ] ) ) );
        // logger.fine("processForm: retMe=" + JSON.stringify(retMe) );
        return retMe;
    };

    /**
     * Called when the controller is loaded.
     */
    var onLoad = function() {
        logger.fine("onLoad: entry");

        refreshCanvas( processForm() );
    }

    /**
     * Keep track so we know what we need to redraw.
     */
    var prevTaxableIncome = 0;
    var prevIncome = 0;

    /**
     *
     */
    var refreshCanvas = function( incomeData ) {

        logger.fine("refreshCanvas: incomeData=" + JSON.stringify(incomeData)
                                        + ", prevIncome=" + prevIncome
                                        + ", prevTaxableIncome=" + prevTaxableIncome );

        $scope.incomeData = incomeData;

        // -rx- if (prevIncome != $scope.inputMedicareTaxWithheld ) {
        if (prevIncome != incomeData.medicareWages ) {
            // redraw everything (need to re-scale since the total income changed)
            prevTaxableIncome = 0;
        }

        TheCanvas.refresh( incomeData, prevTaxableIncome );

        prevIncome = incomeData.medicareWages ;
        prevTaxableIncome = incomeData.agi - incomeData.totalDeduction;
    };

    /**
     * Init and Export to scope
     */
    $scope.onFormSubmit = onFormSubmit;
    $scope.inputDeduction = "6929.19";  // state tax + charity  // TaxRates.deductions.single;

    $scope.inputWages = "111379.38";
    $scope.inputSsWages = "118434.14";
    $scope.inputMedicareWages = "118434.14";
    $scope.inputInterestIncome = "36.93";
    $scope.inputDividendIncome = "2864.33";
    
    $scope.inputIncomeTaxWithheld= "23694.53";
    $scope.inputSsTaxWithheld = "7342.92";
    $scope.inputMedicareTaxWithheld = "1717.30";

    $scope.TaxRates = TaxRates;
    
    onLoad();


}])


/**
 * underscore.js support.
 */
.factory('_', function() {
    return window._; // assumes underscore has already been loaded on the page
})


/**
 * Translates between income values and chart pixels.
 *       
 */
.factory("Projector", [ "Logger", "_", 
                function(Logger,   _) {

    var logger = Logger.getLogger("Projector", {all: true} );
    logger.info("alive!");

    /**
     * @return a "pixels-per-dollar" function that can be used to calculate
     *         the number of pixels given a number of dollars
     */
    var ppd = function( pixels, dollars ) {
        var conversionRate = pixels / dollars;
        return function( d ) {
            return d * conversionRate;
        };
    };

    return {
        ppd: ppd
    };

}])


/**
 * The canvas element
 *       
 */
.factory("TheCanvas", [ "Logger", "_", "$q", "TaxRates",  "Projector", "$filter",
                function(Logger,   _,   $q,   TaxRates,    Projector,   $filter) {


    var logger = Logger.getLogger("TheCanvas", {info: true} );
    logger.info("alive!");

    /**
     * The x-coord for the vertical income axis line
     */
    var incomeAxisX = 150;

    /**
     * Bar colors for the "tax withheld" bar
     */
    var fillStyleRefund = "#4c4";
    var fillStyleBill = "#c44";

    /**
     * Income bars, tax bars, all have same width
     */
    var barWidth = 100;

    /**
     * Create a new canvas element 
     *
     * The purpose of creating a brand new canvas element for each refresh()
     * is to ensure that leftover animations from a previous refresh() do not
     * interfere with the current refresh() (since the previous animations are
     * drawing on a canvas element that's been replaced and is no longer visible).
     *
     * @return the new canvas element
     */
    var createCanvasElement = function() {

        var newCanvasElement = document.createElement("canvas");
        newCanvasElement.id = "itc-canvas";
        newCanvasElement.setAttribute("width","800");
        newCanvasElement.setAttribute("height","600");

        return newCanvasElement;
    };

    /**
     * Replace the existing <canvas> element in the DOM with the given newCanvasElement
     */
    var replaceCanvasElement = function( newCanvasElement ) {
        var oldCanvasElement = document.getElementById("itc-canvas");
        document.getElementById("itc-canvas-parent").replaceChild( newCanvasElement, oldCanvasElement );
    };

    /**
     * TODO: ultimately want to get rid of all "global" state.
     */
    var theCanvasElement = document.getElementById("itc-canvas");

    /**
     * @return the width of the <canvas> element
     */
    var getWidth = function() {
        return theCanvasElement.width;
    };

    /**
     * @return the height of the <canvas> element
     */
    var getHeight = function() {
        return theCanvasElement.height;
    };

    /**
     * @return the center X coordinate
     */
    var getXCenter = function() {
        return getWidth() / 2;
    }

    /**
     * A "view" or coord frame for translating to. 
     * TODO: ultimately want to get rid of all "global" state.
     */
    var frame0 = { x: 0, y: getHeight() };
    var frame1 = { x: 0, y: getHeight() - 20};

    /**
     * @return the X coord for the vertical income axis
     */
    var getIncomeAxisX = function() {
        return incomeAxisX;
    };

    /**
     * @return the X coord for the income bar
     */
    var getIncomeBarX = function() {
        return getIncomeAxisX();
    };

    /**
     * @return the X coord for income axis labels (income bracket levels)
     */
    var getIncomeAxisLabelX = function() {
        return getIncomeAxisX() - 100;
    };

    /**
     * @return the X coord for the tax bars
     */
    var getTaxBarX = function() {
        return getIncomeBarX() + 100 + 1;
    };

    /**
     * @return the X coord for the total tax bar
     */
    var getTotalTaxBarX = function() {
        return getMedicareTaxBarX();
    };

    /**
     * @return the X coord for the medicare tax bar
     */
    var getMedicareTaxBarX = function() {
        return getSocialSecurityTaxBarX() + 120 ;
    };

    /**
     * @return the x coord for the social security tax bar
     */
    var getSocialSecurityTaxBarX = function() {
        return getTaxBarX() + 120 ;
    };

    /**
     * @return the length of the income bracket line for social security
     */
    var getSocialSecurityTaxLineLength = function() {
        return getMedicareTaxBarX() - getIncomeAxisLabelX() - 10;
    };

    /**
     * @return the length of the income bracket line for social security
     */
    var getMedicareTaxLineLength = function() {
        return getSocialSecurityTaxLineLength() + 120 
    };

    /**
     * @return the x coord of the tax withheld bar
     */
    var getTaxWithheldBarX = function() {
        return getMedicareTaxBarX() + 120;
    };

    /**
     * fully clear the canvas context
     * Note: this function isn't used, since we replace the entire <canvas>
     *       element on refresh().
     */
    var clear = function() {
        canvas.translate(0,0);
        canvas.clearRect( 0, 0, getWidth(), getHeight() );
    };

    /**
     * Draw a line from from to to.
     */
    var drawLine = function(canvas, from, to) {
        canvas.moveTo( from.x, from.y);
        canvas.lineTo( to.x,  to.y);
        canvas.stroke();
    };

    /**
     * Render function used by income bar and tax bar animations.
     * Draws a bar (rectangle) from the given state.
     *
     * @param state 
     */
    var barRenderFn = function(state) {
        translate(state.canvas, state.frame);
        state.canvas.fillStyle = state.fillStyle;
        state.canvas.fillRect( state.x,
                               -1 * state.y,
                               state.w,
                               -1 * state.h );
    };

    /**
     * Iterate function used by income bar and tax bar animations.
     * Increments the state.h (height).
     * 
     * @param state - .h, .endHeight
     * 
     * @return state.h < state.endHeight
     *         true indicates to continue the animation
     *         false indicates to stop the animation
     */
    var barIterateFn = function(state) {
        state.h += 1;
        return (state.h < state.endHeight) ;
    };

    /**
     * Iterate function used by ss and medicare bars.  These
     * are different than other income/tax bars in that they grow
     * in a downward direction ("desc") instead of upward .
     *
     * Increments state.h and decrements state.y
     *
     * @return state.h < state.endHeight
     *         true indicates to continue the animation
     *         false indicates to stop the animation
     *
     */
    var descBarIterateFn = function(state) {
        state.h += 2;
        state.y -= 2;
        return (state.h < state.endHeight) ;
    };

    /**
     * Render function used to draw bracket lines and other lines
     */
    var lineRenderFn = function(state) {
        translate(state.canvas, state.frame);
        state.canvas.beginPath();
        state.canvas.strokeStyle = state.fillStyle;
        state.canvas.lineWidth = 0.5;
        drawLine( state.canvas,
                  { x: state.x,            y: -state.y },
                  { x: state.x + state.l,  y: -state.y } );
    };

    /**
     * Iterate function used for drawing bracket lines and other lines
     * Increments state.l by 4.
     *
     * @return state.l < state.endLength
     *         true indicates to continue the animation
     *         false indicates to stop the animation
     */
    var lineIterateFn = function(state) {
        state.l += 4;
        return (state.l < state.endLength) ;
    };

    /**
     * @param afterMe promise
     * @param functions... animation functions. all are added to as then()'s of the given promise, so they
     *        will all run in parallel when the afterMe promise is resolved.
     *
     * @return a promise that is resolved when ALL animations run in parallel are resolved.
     */
    var runInParallel = function( afterMe ) {
        logger.fine("runInParallel: " + arguments.length + ", arguments=" + arguments);
        var promises = _.map( _.flatten(arguments), function(arg) { return ( _.isFunction(arg) ) ? afterMe.then(arg) : null } );
        return $q.all( _.compact( promises ) );
    };

    /**
     *
     * @param afterMe promise
     * @param functions... animation functions, run sequentially after the given afterMe promise.
     * 
     * @return the last promise returned by the last animation function
     */
    var runInSequence = function( afterMe ) {
        logger.fine("runInParallel: " + arguments.length + ", arguments=" + arguments);
        _.each( _.flatten(arguments), 
                function(arg) { 
                    if ( _.isFunction(arg) ) {
                        afterMe = afterMe.then(arg); 
                    }
                }
              );
        return afterMe;
    };


    /**
     * @param renderFn
     * @param iterateFn
     * @param state
     *
     * @return a promise that is resolved when the animation is complete.
     */
    var animate = function(renderFn, iterateFn, state) {
        logger.fine("animate: returning animation promise for state: " + JSON.stringify(state) );

        // Note: I believe the passed-in function is executed immediately / synchronously
        return $q( function(resolve, reject) {

            logger.fine("animate: starting animation for state: " + JSON.stringify(state) );
            var id = setInterval( function() {
                            
                                      state.canvas.save();
                                      renderFn( state );
                                      state.canvas.restore();

                                      if ( ! iterateFn( state ) ) {
                                          clearInterval(id);
                                          logger.fine("animate: ending animation for state: " + JSON.stringify(state) );
                                          resolve(state);
                                      }
                                  },
                                  2 );
        });
    };

    /**
     * canvas.translate(frame.x, frame.y)
     */
    var translate = function(canvas, frame) {
        canvas.translate(frame.x, frame.y);  // translate 0,0 to lower-left corner (instead of upper-left)
    };

    /**
     * Draw the vertical income axis.
     */
    var drawIncomeAxis = function( canvas, frame ) {
        canvas.save();

        translate( canvas, frame ); 
        canvas.beginPath();
        canvas.strokeStyle = "#888888";
        canvas.lineWidth = 1;
        drawLine( canvas,
                  {x: getIncomeAxisX(), y: 0}, 
                  {x: getIncomeAxisX(),  y: -1 * ( getHeight() - 25 ) } );

        canvas.restore();
    };

    /**
     * Draw a solid x axis.
     */
    var drawXAxis = function( canvas, frame ) {
        canvas.save();

        translate( canvas, frame ); 
        canvas.beginPath();
        canvas.strokeStyle = "#888888";
        canvas.lineWidth = 1;
        drawLine( canvas,
                  {x: getIncomeAxisX(), y: 0}, 
                  {x: getTaxWithheldBarX() + 120,  y: 0 } );

        canvas.restore();
    };

    
    /**
     * Draw x-axis labels
     */
    var drawXAxisLabels = function( canvas, frame ) {
        canvas.save();

        translate( canvas, frame);
        canvas.font="14px Georgia";
        // canvas.strokeStyle = "#888";
        // canvas.strokeText( state.label, state.x, -1 * (state.y + 5) ); 
        canvas.fillStyle = "#888";
        canvas.textAlign = "start";
        canvas.fillText( "Brackets", getIncomeAxisLabelX() + 10, -5);
        canvas.fillText( "Income", getIncomeAxisX() + 10, -5);
        canvas.fillText( "Tax", getTaxBarX() + 10, -5);
        canvas.fillText( "Total Tax", getTotalTaxBarX() + 10, -5);  
        canvas.fillText( "Tax Withheld", getTaxWithheldBarX() + 10, -5);  

        canvas.restore();
    };

    /**
     * @return an array of animate() calls, for each of the tax brackets.
     */
    var buildBracketLineAnimations = function(canvas, income, ppdFn, prevIncome) {

        var lineLength = 315;  // + 1 for the spacing between income bar and tax bar

        // Configure initial state(s).
        var states = _.map( TaxRates.getBrackets(income),
                            function(bracket) {
                                return { x: getIncomeAxisLabelX(),
                                         y: ppdFn( TaxRates.getBracketTop(bracket,income) ),
                                         l: shouldAnimate(bracket, income, prevIncome) ? 0 : lineLength,
                                         endLength: lineLength,
                                         canvas: canvas,
                                         frame: frame1,
                                         fillStyle: "#888888"
                                       };
                            } );

        logger.fine("buildBracketLineAnimations: states=" + JSON.stringify(states));

        return _.map( states, function(state) { return _.partial( animate, lineRenderFn, lineIterateFn, state ); } );
    };

    /**
     * @return an array of animate() calls, for each of the tax brackets.
     */
    var buildBracketLabelAnimations = function(canvas, income, ppdFn) {

        // Configure initial state(s).
        var states = _.map( TaxRates.getBrackets(income),
                            function(bracket) {
                                return { label: $filter("currency")( TaxRates.getBracketTop(bracket,income), "$", 0 ), 
                                         rateLabel: bracket.rateLabel,
                                         x: getIncomeAxisLabelX(),
                                         y: ppdFn( TaxRates.getBracketTop(bracket,income) ) ,
                                         canvas: canvas,
                                         frame: frame1
                                       } ;
                            } );

        var renderFn = function(state) {
            translate(state.canvas, state.frame);
            state.canvas.font="14px Georgia";
            // canvas.strokeStyle = "#888";
            // canvas.strokeText( state.label, state.x, -1 * (state.y + 5) ); 
            state.canvas.fillStyle = "#888";
            state.canvas.textAlign = "start";
            state.canvas.fillText( state.label, state.x, -1 * (state.y + 5) );  

            state.canvas.textAlign = "end";
            state.canvas.fillText( state.rateLabel, state.x + 95, -1 * (state.y - 15) );  
        };

        var iterateFn = function() { 
            return false; 
        };

        return _.map( states, function(state) { return _.partial(animate, renderFn, iterateFn, state); } );
    };


    /**
     * @return label, e.g. "10% = $927"
     */
    var genTaxRateLabel = function(bracket, income) {
        if (bracket.rate == 0) {
            return "";
        }

        var incomeRange = TaxRates.getBracketSize(bracket, income); 
        var taxedAmount = TaxRates.getTaxedAmount(bracket, income);

        return $filter("currency")(incomeRange, "$", 0)
                + " @"
                + bracket.rateLabel
                + " = " 
                + $filter("currency")(taxedAmount, "$", 0);
    };

    /**
     * @return label for taxed amount, e.g. "$1234"
     */
    var getTaxedAmountLabel = function( bracket, income) {
        return (bracket.rate == 0) 
                    ? ""
                    : bracket.rateLabel + " = " + $filter("currency")( TaxRates.getTaxedAmount(bracket,income), "$", 0);
    };

    /**
     * @return label for the top of the bracket, e.g. "$1234"
     */
    var getBracketTopLabel = function( bracket, income) {
        return (bracket.top == 0) 
                    ? ""
                    : $filter("currency")( TaxRates.getBracketTop(bracket,income), "$", 0);
    };

    /**
     * @return an array of animate() calls, for each of the tax brackets.
     */
    var buildBracketTaxRateLabelAnimations = function(canvas, income, ppdFn) {

        var brackets = TaxRates.getBrackets(income);

        // Configure initial state(s).
        var states = _.map( brackets,
                            function(bracket) {
                                return { // label: genTaxRateLabel(bracket, income),
                                         label:  getTaxedAmountLabel(bracket, income),
                                         x: getTaxBarX() + 5,
                                         // y: ppdFn( Math.min(bracket.top,income) - (TaxRates.getBracketSize(bracket, income)/2) ) } ;
                                         // y: ppdFn( Math.min(bracket.top,income) ) - 15 } ;
                                         y: ppdFn( bracket.bottom + TaxRates.getTaxedAmount(bracket,income) ) + 5 ,
                                         canvas: canvas,
                                         frame: frame1
                                       } ;
                            } );

        var renderFn = function(state) {
            translate(state.canvas, state.frame);
            state.canvas.font="14px Georgia";
            state.canvas.fillStyle = "#888";
            state.canvas.fillText( state.label, state.x, -1 * (state.y) );  
        };

        var iterateFn = function() { 
            return false; 
        };

        return _.map( states, function(state) { return _.partial(animate, renderFn, iterateFn, state); } );
    };

    /**
     * @return an animate call for the effective tax label
     */
    var buildTotalTaxRateLabelAnimation = function(canvas, incomeData, ppdFn) {

        // -rx- // compute total taxed amount and effective tax rate
        // -rx- var totalTaxedAmount = _.reduce(brackets, 
        // -rx-                                 function( memo, bracket ) { return memo + TaxRates.getTaxedAmount(bracket, taxableIncome); }, 
        // -rx-                                 0 );
        // -rx- totalTaxedAmount += TaxRates.getTaxedAmount( TaxRates.socialsecurity.single, taxableIncome );
        // -rx- totalTaxedAmount += TaxRates.getTaxedAmount( TaxRates.medicare.single, taxableIncome );

        var effectiveTaxRate =  Math.round( incomeData.totalTax / incomeData.totalIncome * 100 );

        logger.fine("buildTotalTaxRateLabelAnimation: effectiveTaxRate=" + effectiveTaxRate );

        // Configure initial state(s).
        var brackets = TaxRates.getBrackets(incomeData.agi);
        var state = {   label: $filter("currency")( incomeData.totalTax, "$", 0) + " (" +  effectiveTaxRate + "%)",
                        // topLabel: "Tax Total",
                        x: getTotalTaxBarX() + 5,
                        // y: ppdFn( Math.min(bracket.top,income) - (TaxRates.getBracketSize(bracket, income)/2) ) } ;
                        // y: ppdFn( Math.min(bracket.top,income) ) - 15 } ;
                        y: ppdFn( incomeData.totalTax ) + (brackets.length + 2) + 5,  // account for extra pixels between brackets
                        // topY: ppdFn( totalTaxedAmount ) + 20
                        canvas: canvas,
                        frame: frame1
                    } ;

        var renderFn = function(state) {
            translate(state.canvas, state.frame);
            state.canvas.font="14px Georgia";
            state.canvas.fillStyle = "#888";
            state.canvas.fillText( state.label, state.x, -1 * (state.y) );  
            // state.canvas.fillText( state.topLabel, state.x, -1 * (state.topY) );  
        };

        var iterateFn = function() { 
            return false; 
        };

        return _.partial(animate, renderFn, iterateFn, state); 
    };

    /**
     * @return an animate() function, for the deduction bar
     */
    var buildDeductionBarAnimation = function(canvas, incomeData, ppdFn) {

        // Configure initial state(s).
        var state = { x: getIncomeBarX(),
                       y: ppdFn(incomeData.taxableAgi) + 1,
                       w: barWidth,
                       h: 0,
                       endHeight: ppdFn( incomeData.totalIncome - incomeData.taxableAgi ),
                       canvas: canvas,
                       frame: frame1
                     };

        state.fillStyle = TaxRates.deductionFillStyle;

        logger.fine("buildDeductionBarAnimation: state=" + JSON.stringify(state));

        return _.partial(animate, barRenderFn, barIterateFn, state);
    };

    /**
     * @return an animate() function, for the top income line (including deduction)
     */
    var buildIncomeLineAnimation = function(canvas, income, ppdFn) {

        var lineLength = 215;  // + 1 for the spacing between income bar and tax bar

        // Configure initial state(s).
        var state = {  x: getIncomeAxisLabelX(),
                       y: ppdFn( income ),
                       l: 0,
                       endLength: lineLength,
                       canvas: canvas,
                       frame: frame1,
                       fillStyle: "#888"
                     };

        logger.fine("buildIncomeLineAnimation: state=" + JSON.stringify(state));

        return _.partial( animate, lineRenderFn, lineIterateFn, state ); 
    };

    /**
     * @return an animate() function, for rendering the income label
     */
    var buildIncomeLabelAnimation = function(canvas, income, ppdFn) {

        // Configure initial state(s).
        var state = { label: $filter("currency")( income, "$", 0 ), 
                      rateLabel: "0%",
                      x: getIncomeAxisLabelX(),
                      y: ppdFn( income ) ,
                      canvas: canvas,
                      frame: frame1
                    } ;

        var renderFn = function(state) {
            translate(state.canvas, state.frame);
            state.canvas.font="14px Georgia";
            // canvas.strokeStyle = "#888";
            // canvas.strokeText( state.label, state.x, -1 * (state.y + 5) ); 
            state.canvas.fillStyle = "#888";
            state.canvas.textAlign = "start";
            state.canvas.fillText( state.label, state.x, -1 * (state.y + 5) );  

            state.canvas.textAlign = "end";
            state.canvas.fillText( state.rateLabel, state.x + 95, -1 * (state.y - 15) );  
        };

        var iterateFn = function() { 
            return false; 
        };

        return _.partial(animate, renderFn, iterateFn, state); 
    };

    /**
     * @return an array of animate() functions, for each of the tax brackets.
     */
    var buildIncomeBarAnimations = function(canvas, income, ppdFn, prevIncome) {

        // Configure initial state(s).
        var states = _.map( TaxRates.getBrackets(income),
                            function(bracket) {
                                var endHeight = ppdFn( TaxRates.getBracketSize(bracket, income) );
                                return { x: getIncomeBarX(),
                                         y: ppdFn( bracket.bottom ) + 1,
                                         w: barWidth,
                                         h: shouldAnimate(bracket, income, prevIncome) ? 0 : endHeight,
                                         canvas: canvas,
                                         endHeight: endHeight,
                                         frame: frame1
                                       };
                            } );

        for (var i=0; i < states.length; ++i) {
            states[i].fillStyle = TaxRates.bracketFillStyles[i];
        }

        logger.fine("buildIncomeBarAnimations: states=" + JSON.stringify(states));

        return _.map( states, function(state) { return _.partial(animate, barRenderFn, barIterateFn, state); } );
    };

    /**
     * @return an animate() call for the social security bracket.
     *
     */
    var buildSocialSecurityTaxBarAnimation = function(canvas, income, ppdFn) {

        var bracket = TaxRates.socialsecurity.single;

        var state = { x: getSocialSecurityTaxBarX(),
                      y: ppdFn( TaxRates.getBracketTop( bracket,income) ) - 1 ,
                      w: barWidth,
                      h: 0,
                      endHeight: ppdFn( TaxRates.getTaxedAmount(bracket, income) ),
                      fillStyle:  TaxRates.socialsecurityFillStyle,
                      canvas: canvas,
                      frame: frame1
                    };

        logger.fine("buildSocialSecurityTaxBarAnimations: state=" + JSON.stringify(state));

        return _.partial(animate, barRenderFn, descBarIterateFn, state); 
    };


    /**
     * This method is for the "Total Tax" column of tax bars, stacked on top of each
     * other to show the total tax.
     *
     * @return an animate() call for social security tax bar (for "Total Tax" column)
     *
     */
    var buildTotalTaxSocialSecurityTaxBarAnimation = function(canvas, incomeData, ppdFn) {

        // Need to add 1 pixel per bracket to account for the pixel of space between
        // the bracket bars.
        var prevTopPixel = ppdFn( incomeData.incomeTax ) + TaxRates.getBrackets(incomeData.taxableAgi).length;

        var state = {  x: getTotalTaxBarX(),
                       y: prevTopPixel + 1,
                       w: barWidth,
                       h: 0,
                       endHeight: ppdFn( incomeData.socialSecurityTax ),
                       fillStyle:  TaxRates.socialsecurityFillStyle,
                       canvas: canvas,
                       frame: frame1
                     };

        logger.fine("buildSocialSecurityTaxBarAnimations2: state=" + JSON.stringify(state));

        return _.partial(animate, barRenderFn, barIterateFn, state); 
    };


    /**
     * @return an animate() call, for social security
     */
    var buildSocialSecurityTaxRateLabelAnimation = function(canvas, income, ppdFn) {

        var bracket = TaxRates.socialsecurity.single;

        // Configure state.
        var state = { label: getTaxedAmountLabel(bracket, income),
                      topLabel: getBracketTopLabel(bracket, income),
                      topTopLabel: "Social Security",
                      x: getSocialSecurityTaxBarX(),
                      topY: ppdFn( TaxRates.getBracketTop( bracket,income) ) + 7,
                      topTopY: ppdFn( TaxRates.getBracketTop( bracket,income) ) + 20,
                      y: ppdFn( TaxRates.getBracketTop( bracket,income) ) - ppdFn( TaxRates.getTaxedAmount(bracket, income) ) - 15,
                      canvas: canvas,
                      frame: frame1
                    };

        var renderFn = function(state) {
            translate(state.canvas, state.frame);
            state.canvas.font="14px Georgia";
            state.canvas.fillStyle = TaxRates.socialsecurityFillStyle ;
            state.canvas.fillText( state.topTopLabel, state.x, -1 * (state.topTopY) );  
            state.canvas.fillText( state.topLabel, state.x, -1 * (state.topY) );  
            state.canvas.fillText( state.label, state.x, -1 * (state.y) );  
        };

        var iterateFn = function() { 
            return false; 
        };

        return _.partial(animate, renderFn, iterateFn, state);
    };

    /**
     * @return an array of animate() calls, for each of the tax brackets.
     */
    var buildSocialSecurityLineAnimation = function(canvas, income, ppdFn) {

        var bracket = TaxRates.socialsecurity.single;

        // Configure initial state.
        var state = { x: getIncomeAxisLabelX(),
                      y: ppdFn( TaxRates.getBracketTop(bracket, income) ) + 1,
                      l: 0,
                      endLength: getSocialSecurityTaxLineLength(),
                      fillStyle: TaxRates.socialsecurityFillStyle,
                      canvas: canvas,
                      frame: frame1,
                    };
                    
        logger.fine("buildSocialSecurityLineAnimation: state=" + JSON.stringify(state));

        return _.partial( animate, lineRenderFn, lineIterateFn, state ); 
    };

    /**
     * @return an animate() call for the medicare bracket.
     *
     */
    var buildMedicareTaxBarAnimation = function(canvas, income, ppdFn) {

        var bracket = TaxRates.medicare.single;

        var state = { x: getMedicareTaxBarX(),
                      y: ppdFn( TaxRates.getBracketTop( bracket,income) ) ,
                      w: barWidth,
                      h: 0,
                      endHeight: ppdFn( TaxRates.getTaxedAmount(bracket, income) ),
                      fillStyle:  TaxRates.medicareFillStyle,
                      canvas: canvas,
                      frame: frame1
                    };

        logger.fine("buildMedicareTaxBarAnimations: state=" + JSON.stringify(state));

        return _.partial(animate, barRenderFn, descBarIterateFn, state); 
    };


    /**
     * This method is for the "Total Tax" column of tax bars, stacked on top of each
     * other to show the total tax.
     *
     * @return an animate() call for medicare tax bar 
     *
     */
    var buildTotalTaxMedicareTaxBarAnimation = function(canvas, incomeData, ppdFn) {

        // -rx- // Configure initial state(s).
        // -rx- var totalTaxedAmount = _.reduce(TaxRates.getBrackets(income),
        // -rx-                                 function( memo, bracket ) { return memo + TaxRates.getTaxedAmount(bracket, income); }, 
        // -rx-                                 0 );
        // -rx- totalTaxedAmount += TaxRates.getTaxedAmount( TaxRates.socialsecurity.single, income );
        
        // Need to add 1 pixel per bracket to account for the pixel of space between
        // the bracket bars (and 1 pixel for the social security brakcet)
        var prevTopPixel = ppdFn( incomeData.incomeTax + incomeData.socialSecurityTax ) 
                            + TaxRates.getBrackets(incomeData.taxableAgi).length 
                            + 1;

        var state = { x: getTotalTaxBarX(),
                       y: prevTopPixel + 1,
                       w: barWidth,
                       h: 0,
                       endHeight: ppdFn( incomeData.medicareTax ),
                       fillStyle:  TaxRates.medicareFillStyle,
                       canvas: canvas,
                       frame: frame1
                     };


        logger.fine("buildMedicareTaxBarAnimations2: state=" + JSON.stringify(state));

        return _.partial(animate, barRenderFn, barIterateFn, state); 
    };


    /**
     * @return an animate() call, for medicare
     */
    var buildMedicareTaxRateLabelAnimation = function(canvas, income, ppdFn) {

        var bracket = TaxRates.medicare.single;

        // Configure state.
        var state = { label: getTaxedAmountLabel(bracket, income),
                      topLabel: getBracketTopLabel(bracket, income),
                      topTopLabel: "Medicare",
                      x: getMedicareTaxBarX(),
                      topY: ppdFn( TaxRates.getBracketTop( bracket,income) ) + 7,
                      topTopY: ppdFn( TaxRates.getBracketTop( bracket,income) ) + 20,
                      y: ppdFn( TaxRates.getBracketTop( bracket,income) ) - ppdFn( TaxRates.getTaxedAmount(bracket, income) ) - 15,
                      canvas: canvas,
                      frame: frame1
                    };

        var renderFn = function(state) {
            translate(state.canvas, state.frame);
            state.canvas.font="14px Georgia";
            state.canvas.fillStyle = TaxRates.medicareFillStyle;
            state.canvas.fillText( state.topTopLabel, state.x, -1 * (state.topTopY) );  
            state.canvas.fillText( state.topLabel, state.x, -1 * (state.topY) );  
            state.canvas.fillText( state.label, state.x, -1 * (state.y) );  
        };

        var iterateFn = function() { 
            return false; 
        };

        return _.partial(animate, renderFn, iterateFn, state);
    };

    /**
     * @return an array of animate() calls, for the medicare tax brackets.
     */
    var buildMedicareLineAnimation = function(canvas, income, ppdFn) {

        var bracket = TaxRates.medicare.single;

        // Configure initial state.
        var state = { x: getIncomeAxisLabelX(),
                      y: ppdFn( TaxRates.getBracketTop( bracket,income) ) + 2,
                      l: 0,
                      endLength: getMedicareTaxLineLength(),
                      fillStyle: TaxRates.medicareFillStyle,
                      canvas: canvas,
                      frame: frame1
                    };
                    
        logger.fine("buildMedicareLineAnimation: state=" + JSON.stringify(state));

        return _.partial( animate, lineRenderFn, lineIterateFn, state ); 
    };


    /**
     * This method is for the 2nd column of tax bars, stacked on top of each
     * other to show the total tax.
     *
     * @return an array of animate() calls, for each of the tax brackets.
     *
     */
    var buildTotalTaxTaxBarAnimations = function(canvas, income, ppdFn, prevIncome) {

        // Configure initial state(s).
        var prevTopPixel = 0;
        var states = _.map( TaxRates.getBrackets(income),
                            function(bracket) {
                                var endHeight = ppdFn( TaxRates.getTaxedAmount(bracket, income) );
                                var retMe = { x: getTotalTaxBarX(),
                                              y: prevTopPixel + 1,
                                              w: barWidth,
                                              h: shouldAnimate(bracket, income, prevIncome) ? 0 : endHeight,
                                              endHeight: endHeight,
                                              canvas: canvas,
                                              frame: frame1
                                            };
                                prevTopPixel = retMe.y + endHeight;
                                return retMe;
                            } );

        for (var i=0; i < states.length; ++i) {
            states[i].fillStyle = TaxRates.bracketFillStyles[i];
        }

        logger.fine("buildTotalTaxTaxBarAnimations: states=" + JSON.stringify(states));

        return _.map( states, function(state) { return _.partial(animate, barRenderFn, barIterateFn, state); } );
    };

    /**
     * @return an array of animate() calls, for each of the tax brackets.
     */
    var buildTaxBarAnimations = function(canvas, income, ppdFn, prevIncome) {

        // Configure initial state(s).
        var states = _.map( TaxRates.getBrackets(income),
                            function(bracket) {
                                var endHeight = ppdFn( TaxRates.getTaxedAmount(bracket, income) );
                                return { x: getTaxBarX(),
                                         y: ppdFn( bracket.bottom ) + 1,
                                         w: barWidth,
                                         h: shouldAnimate(bracket, income, prevIncome) ? 0 : endHeight,
                                         endHeight: endHeight,
                                         canvas: canvas,
                                         frame: frame1
                                       };
                            } );

        for (var i=0; i < states.length; ++i) {
            states[i].fillStyle = TaxRates.bracketFillStyles[i];
        }

        logger.fine("buildTaxBarAnimations: states=" + JSON.stringify(states));

        return _.map( states, function(state) { return _.partial(animate, barRenderFn, barIterateFn, state); } );
    };

    /**
     * This method is for the tax withheld and refund / payment bar
     *
     * @return an animate() call for withheld bar
     *
     */
    var buildTaxWithheldBarAnimations = function(canvas, incomeData, ppdFn) {

        // -rx- var totalTaxedAmount = _.reduce(TaxRates.getBrackets(income), 
        // -rx-                                 function( memo, bracket ) { return memo + TaxRates.getTaxedAmount(bracket, income); }, 
        // -rx-                                 0 );
        // -rx- totalTaxedAmount += TaxRates.getTaxedAmount( TaxRates.socialsecurity.single, income );
        // -rx- totalTaxedAmount += TaxRates.getTaxedAmount( TaxRates.medicare.single, income );

        if (incomeData.totalTax < incomeData.totalTaxWithheld) {
            // Refund!
            endHeight0 = ppdFn( incomeData.totalTax ) + TaxRates.getBrackets(incomeData.taxableAgi).length ;   // account for extra pixels between brackets, plus rounding diffs between totalTaxedAmount and individual brackets
            endHeight1 = ppdFn( incomeData.totalTaxWithheld - incomeData.totalTax );
            fillStyle1 = fillStyleRefund;
        } else {
            // bill
            endHeight0 = ppdFn( incomeData.totalTaxWithheld );
            endHeight1 = ppdFn( incomeData.totalTax - incomeData.totalTaxWithheld ) + TaxRates.getBrackets(incomeData.taxableAgi).length ; // account for extra pixles betwen brackets
            fillStyle1 = fillStyleBill;
        }

        // Configure initial state(s).
        var states = [ {  x: getTaxWithheldBarX(),
                          y: 0 + 1,
                          w: barWidth,
                          h: 0,
                          endHeight: endHeight0,
                          fillStyle:  "#ddd",
                          canvas: canvas,
                          frame: frame1
                       } ,
                       { 
                          x: getTaxWithheldBarX(),
                          y: endHeight0 + 2,
                          w: barWidth,
                          h: 0,
                          endHeight: endHeight1,
                          fillStyle: fillStyle1,
                          canvas: canvas,
                          frame: frame1
                       }
                    ];

        logger.fine("buildTaxWithheldBarAnimations: states=" + JSON.stringify(states));

        return _.map( states, function(state) { return _.partial(animate, barRenderFn, barIterateFn, state); } );
    };

    /**
     * @return an animate call for the effective tax
     */
    var buildTaxWithheldLabelAnimation = function(canvas, incomeData, ppdFn) {

        // -rx- // compute total taxed amount
        // -rx- var totalTaxedAmount = _.reduce(TaxRates.getBrackets(income), 
        // -rx-                                 function( memo, bracket ) { return memo + TaxRates.getTaxedAmount(bracket, income); }, 
        // -rx-                                 0 );
        // -rx- totalTaxedAmount += TaxRates.getTaxedAmount( TaxRates.socialsecurity.single, income );
        // -rx- totalTaxedAmount += TaxRates.getTaxedAmount( TaxRates.medicare.single, income );

        // Match text color with refund/bill
        var fillStyle = (incomeData.totalTax < incomeData.totalTaxWithheld ) ? fillStyleRefund : fillStyleBill;
        var taxDiff = Math.abs( incomeData.totalTax - incomeData.totalTaxWithheld );
        var label = (incomeData.totalTax < incomeData.totalTaxWithheld ) ? "Refund" : "Bill"; 

        // -rx- logger.fine("buildTaxWithheldLabelAnimation: totalTaxedAmount=" + incomeData.totalTax );

        // Configure initial state(s).
        var state = {   label: label + ": " + $filter("currency")( taxDiff, "$", 0),
                        x: getTaxWithheldBarX() + 1,
                        // y: ppdFn( Math.min(bracket.top,income) - (TaxRates.getBracketSize(bracket, income)/2) ) } ;
                        // y: ppdFn( Math.min(bracket.top,income) ) - 15 } ;
                        y: ppdFn( Math.max( incomeData.totalTax, incomeData.totalTaxWithheld )) + (TaxRates.getBrackets(incomeData.taxableAgi).length + 2) + 5 , // account for extra pixesl between brackets
                        // topY: ppdFn( totalTaxedAmount ) + 20
                        fillStyle: fillStyle,
                        canvas: canvas,
                        frame: frame1
                    } ;

        var renderFn = function(state) {
            translate(state.canvas, state.frame);
            state.canvas.font="16px Georgia";
            state.canvas.fillStyle = state.fillStyle;
            state.canvas.fillText( state.label, state.x, -1 * (state.y) );  
            // state.canvas.fillText( state.topLabel, state.x, -1 * (state.topY) );  
        };

        var iterateFn = function() { 
            return false; 
        };

        return _.partial(animate, renderFn, iterateFn, state); 
    };

    /**
     * Partition the animations according to the animateFlags.
     *
     * @return [ [non-animations], [animations] ]
     */
    var partition = function(animations, animateFlags) {
        // Two partitions.  Each partition is an array of animTuples
        var parts =  _.partition( _.zip(animations, animateFlags), 
                                  function(animTuple) {
                                      return !animTuple[1];
                                  }
                                );
        // Map the two partitions of animTuples into two partitions of just animations
        return _.map( parts, 
                      function(part) { 
                          return _.map(part,
                                       function( animTuple ) {
                                           return animTuple[0];
                                       });
                      } );
    };

    /**
     * 
     * Partition the animations by animateFlags into [ non-animations, animations].
     * Attach all non-animations to startingPromise
     *
     * @return all animations
     */
    var partitionAndAttach = function(startingPromise, animations, animateFlags) {
        var parts = partition(animations, animateFlags);
        runInParallel( startingPromise, parts[0] );
        return parts[1];
    }

    /**
     * @return true if the bracket should be animated again in response to a data refresh.
     *         The bracket should be re-animated if the change in taxable income infringed
     *         on the bracket's income range.
     */
    var shouldAnimate = function(bracket, taxableIncome, prevTaxableIncome) {
        prevTaxableIncome = prevTaxableIncome || 0;
        return taxableIncome < bracket.top || prevTaxableIncome < bracket.top;
    };

    /**
     * "Refresh" the canvas in response to updated data.
     *
     * Not all animations are run. Only for parts of the chart that need to be updated.
     *
     * Note the entire canvas is in fact redrawn... it's just that any drawings that
     * don't need to be animated are drawn in their entirety immediately.
     *
     * @return promise that is resolved when all animations are complete.
     */
    var refresh = function(incomeData, prevTaxableIncome) {

        logger.fine("refresh: incomeData=" + JSON.stringify(incomeData)
                              + ", prevTaxableIncome=" + prevTaxableIncome );


        // Create new canvas element and new canvas context, but don't
        // replace existing canvas element until the end of this function.
        theCanvasElement = createCanvasElement();
        var canvas = theCanvasElement.getContext("2d");

        // set parm defaults
        // -rx- var income = incomeData.agi || 100000;
        // -rx- var withheld = incomeData.totalWithheld || 30000;
        // -rx- var deduction = incomeData.totalDeduction || TaxRates.deductions.single;

        // -rx- var taxableIncome = income - deduction;
        var ppdFn = Projector.ppd( getHeight() - 50, incomeData.totalIncome );    // pixel height of income bar

        // Initialize an empty promise.  It will be resolved immediately and will 
        // kick off the animations (attached via then()).
        var afterMe = Promise.resolve(1);
        var start = afterMe;

        // Array of flags.  True if the bracket should be re-animated.  False otherwise.
        var animateBracketsFlags = _.map( TaxRates.getBrackets( incomeData.taxableAgi ), 
                                          function(bracket) {
                                              return shouldAnimate(bracket, incomeData.taxableAgi , prevTaxableIncome );
                                          });

        // Build the animation functions
        // Deduction bar is built separate but follows the taxable-income bars
        
        var incomeBarAnimations = buildIncomeBarAnimations(canvas, incomeData.taxableAgi, ppdFn, prevTaxableIncome);
        incomeBarAnimations = partitionAndAttach( start, incomeBarAnimations, animateBracketsFlags );

        var bracketLineAnimations = buildBracketLineAnimations(canvas, incomeData.taxableAgi, ppdFn, prevTaxableIncome);
        bracketLineAnimations = partitionAndAttach( start, bracketLineAnimations, animateBracketsFlags );

        var bracketLabelAnimations = buildBracketLabelAnimations(canvas, incomeData.taxableAgi, ppdFn);
        bracketLabelAnimations = partitionAndAttach( start, bracketLabelAnimations, animateBracketsFlags );


        // Group together animations that will run in parallel
        // An income-bar animation runs at the same time as the PREVIOUS bracket-line and bracket-label animations.
        // Note: incomeBarAnimations[0] is for the zero-bracket and therefore has nothing to animate.
        for (var i=0; i < incomeBarAnimations.length; ++i) {
            // Note: not reassigning afterMe.
            if (i > 0) {
                runInParallel( afterMe, 
                               bracketLineAnimations[i-1], 
                               bracketLabelAnimations[i-1]
                             );
            }
            afterMe = runInParallel( afterMe, 
                                     incomeBarAnimations[i]
                                    );
        }

        // Note: not reassigning afterMe.
        runInParallel(afterMe, 
                      bracketLineAnimations[i-1], 
                      bracketLabelAnimations[i-1] 
                     ); 

        // Deduction bar and income line will always need to be refreshed
        afterMe = runInParallel(afterMe, 
                                buildDeductionBarAnimation(canvas, incomeData, ppdFn)
                               );

        afterMe = runInParallel( afterMe, 
                                 buildIncomeLineAnimation(canvas, incomeData.totalIncome, ppdFn),
                                 buildIncomeLabelAnimation(canvas, incomeData.totalIncome, ppdFn) 
                               );

        // Tax bar animations
        var taxBarAnimations = buildTaxBarAnimations(canvas, incomeData.taxableAgi, ppdFn, prevTaxableIncome); 
        taxBarAnimations = partitionAndAttach( start, taxBarAnimations, animateBracketsFlags );

        var totalTaxTaxBarAnimations = buildTotalTaxTaxBarAnimations(canvas, incomeData.taxableAgi, ppdFn, prevTaxableIncome); 
        totalTaxTaxBarAnimations = partitionAndAttach( start, totalTaxTaxBarAnimations, animateBracketsFlags );

        var taxBarLabelAnimations = buildBracketTaxRateLabelAnimations(canvas, incomeData.taxableAgi, ppdFn) 
        taxBarLabelAnimations = partitionAndAttach( start, taxBarLabelAnimations, animateBracketsFlags );

        // Kick off the social security bracket line at the same time as the first
        // tax bar animtations.
        //
        // Note I'm not reassigning afterMe... so the social security line will run in
        // parallel with the tax bar animations below.
        var socialSecuritySequence = runInParallel( afterMe, 
                                                    buildSocialSecurityLineAnimation(canvas, incomeData.socialSecurityWages, ppdFn)
                                                   );

        // Kick off medicare sequence.
        var medicareSequence = runInParallel( afterMe,  
                                              buildMedicareLineAnimation(canvas, incomeData.medicareWages, ppdFn) 
                                             );


        for (var i=0; i < taxBarAnimations.length; ++i) {
            afterMe = runInParallel( afterMe,  
                                     taxBarAnimations[i],
                                     totalTaxTaxBarAnimations[i] 
                                   );
            afterMe = runInParallel( afterMe,
                                     taxBarLabelAnimations[i]
                                   );
        } 

        // Note: joins with socialSecuritySequence
        afterMe = runInParallel( socialSecuritySequence, 
                                 buildSocialSecurityTaxBarAnimation(canvas, incomeData.socialSecurityWages, ppdFn), 
                                 buildTotalTaxSocialSecurityTaxBarAnimation(canvas, incomeData, ppdFn)
                               );

        afterMe = runInParallel( afterMe,  
                                 buildSocialSecurityTaxRateLabelAnimation(canvas, incomeData.socialSecurityWages, ppdFn) 
                               );

        afterMe = runInParallel( medicareSequence,
                                 buildMedicareTaxBarAnimation(canvas, incomeData.medicareWages, ppdFn), 
                                 buildTotalTaxMedicareTaxBarAnimation(canvas, incomeData, ppdFn) 
                               );

        afterMe = runInSequence( afterMe, 
                                 buildMedicareTaxRateLabelAnimation(canvas, incomeData.medicareWages, ppdFn) ,
                                 buildTotalTaxRateLabelAnimation(canvas, incomeData, ppdFn) , 
                                 buildTaxWithheldBarAnimations(canvas, incomeData, ppdFn),
                                 buildTaxWithheldLabelAnimation(canvas, incomeData, ppdFn) 
                               );

        
        // Draw axes and labels.
        drawIncomeAxis( canvas, frame1 );
        drawXAxis( canvas, frame1 );
        drawXAxisLabels( canvas, frame0 );

        // Wait till the end to replace the on-screen canvas element with the new one 
        // we created in this function.
        //
        // By replacing the entire canvas for every refresh() we ensure that animations
        // from a previous refresh() that have yet to complete won't interfere with the
        // animations for the current refresh().  (Animations from a previous refresh
        // will continue to run but their canvas element is no longer visible).
        //
        // Note that all the animations we built above do NOT get run until
        // after this method ends (when the "start" promise gets resovled).
        replaceCanvasElement( theCanvasElement );

        return afterMe;
    };



    /**
     * Export API
     */
    return {
        refresh: refresh,
        getWidth: getWidth,
        getHeight: getHeight
    };

}])


/**
 * Logger
 */
.factory("Logger", [ function() {

    var name = "RootLogger";

    var info = function(msg) {
        console.log(msg);
    }

    var fine = function(msg) {
        console.log(msg);
    }

    var severe = function(msg) {
        alert(msg);
    }

    var getLogger = function( name, options ) {
        options = _.extend( { all: false, info: false, fine: false, severe: true }, options );
        return {
            info: function(msg) { if (options.info || options.all) { info( name + ": " + msg); } },
            fine: function(msg) { if (options.fine || options.all) { fine( name + ": " + msg); } },
            severe: function(msg) { if (options.severe || options.all) { severe( name + ": " + msg); } },
        };
    }

    return {
        info: info,
        fine: fine,
        severe: severe,
        getLogger: getLogger
    };

}])


/**
 * Tax Rate Info - 2015
 *       
 */
.factory("TaxRates", [ "Logger", "_", 
                function(Logger,   _ ) {

    var logger = Logger.getLogger("TaxRates", {all: false} );
    logger.info("alive!");

    /**
     * Tax brackets
     */
    var brackets = { single: [ { rate: 0,    rateLabel: "",     bottom: 0,      top: 0 },
                               { rate: 0.10, rateLabel: "10%",  bottom: 0,      top: 9225 },
                               { rate: 0.15, rateLabel: "15%",  bottom: 9225,   top: 37450 },
                               { rate: 0.25, rateLabel: "25%",  bottom: 37450,  top: 90750 },
                               { rate: 0.28, rateLabel: "28%",  bottom: 90750,  top: 189300 },
                               { rate: 0.33, rateLabel: "33%",  bottom: 189300, top: 411500 },
                               { rate: 0.35, rateLabel: "35%",  bottom: 411500, top: 413200 },
                               { rate: 0.39, rateLabel: "39%",  bottom: 413200, top: Number.MAX_VALUE } 
                             ],
                     married: [ { rate: 0,    bottom: 0,     top: 0 },
                                { rate: 0.10, bottom: 0,     top: 18450 },
                                { rate: 0.15, bottom: 18450, top: 74900 },
                                { rate: 0.25, bottom: 74900, top: 151200 },
                                { rate: 0.28, bottom: 151200,top: 230450 },
                                { rate: 0.33, bottom: 230450,top: 411500 },
                                { rate: 0.35, bottom: 411500,top: 464850 },
                                { rate: 0.39, bottom: 464850,top: Number.MAX_VALUE}
                              ],
                     headofhousehold: [ { rate: 0,    bottom: 0,     top: 0 },
                                        { rate: 0.10, bottom: 0,     top: 13150 },
                                        { rate: 0.15, bottom: 13150, top: 50200 },
                                        { rate: 0.25, bottom: 50200, top: 129600 },
                                        { rate: 0.28, bottom: 129600,top: 209850 },
                                        { rate: 0.33, bottom: 209850,top: 411500 },
                                        { rate: 0.35, bottom: 411500,top: 439000 },
                                        { rate: 0.39, bottom: 439000,top: Number.MAX_VALUE } 
                                      ]
                  };

    /**
     * Standard deductions
     */
    var deductions = { single: 6300,
                       married: 12600,
                       headofhousehold: 9250,
                       personalexemption: 4000
                     };

    /**
     * Social security (OASDI) rates and limits
     */
    var socialsecurity = { single: { rate: 0.062, rateLabel: "6.2%", bottom: 0, top: 118500 } };

    /**
     * Medicare rates
     */
    var medicare = { single: { rate: 0.0145, rateLabel: "1.45%", bottom: 0, top: Number.MAX_VALUE } };

    /**
     * Color palette for brackets, used when drawing the income bar.
     */
    var bracketFillStyles = [   "#000000",
                                "#EBC0FD",
                                "#D5C0FD",
                                "#C0C0FD",
                                "#C0FCFD",
                                "#C0FDD7",
                                "#F8FDC0",
                                "#FDD2C0" ];

    /**
     * @return all brackets applicable to the given income
     */
    var getBrackets = function(income) {

        var retMe = _.filter( brackets.single, 
                         function(bracket) { return bracket.bottom < income ; } );
        logger.fine("getBrackets: income=" + income + ", brackets=" + JSON.stringify(retMe));
        return retMe;
    };

    /**
     * @return the size of the bracket (in terms of income range)
     */
    var getBracketSize = function(bracket, income) {
        return getBracketTop(bracket,income) - bracket.bottom;
    };

    /**
     * @return the top income value of the bracket.
     *         if income < bracket.top, then income is returned.
     */
    var getBracketTop = function(bracket, income) {
        return Math.min(bracket.top,income);
    };

    /**
     * @return the amount of tax for the given bracket and income.
     *         if income > bracket, then the taxed amount for just the bracket range is returned.
     *         if income falls within the bracket, then the taxed amount for the bracket up to the income is returned.
     *         
     */
    var getTaxedAmount = function(bracket, income) {
        var incomeRange = getBracketSize(bracket, income); 
        return bracket.rate * incomeRange;
    };

    /**
     * Export API.
     */
    return {
        brackets: brackets,
        deductions: deductions,
        socialsecurity: socialsecurity,
        socialsecurityFillStyle: "#88f",
        medicare: medicare,
        medicareFillStyle: "#f88",
        deductionFillStyle: "#eee",
        getBrackets: getBrackets,
        bracketFillStyles: bracketFillStyles,
        getBracketTop: getBracketTop,
        getBracketSize: getBracketSize,
        getTaxedAmount: getTaxedAmount
    };

}])





;

