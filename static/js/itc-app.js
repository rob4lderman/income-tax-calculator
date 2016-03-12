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
        logger.fine("onFormSubmit: $scope.inputIncome=" + $scope.inputIncome
                               + ", $scope.inputTaxWithheld=" + $scope.inputTaxWithheld 
                               + ", $scope.inputDeduction=" + $scope.inputDeduction);

         TheCanvas.redraw( parseInt( $scope.inputIncome ),
                           parseInt( $scope.inputTaxWithheld),
                           parseInt( $scope.inputDeduction) );
         // TheCanvas.drawIncomeBar( parseInt( $scope.inputIncome ) );

    };

    /**
     * Called when the controller is loaded.
     */
    var onLoad = function() {
        logger.fine("onLoad: entry");


        TheCanvas.redraw( parseInt( $scope.inputIncome),
                          parseInt( $scope.inputTaxWithheld ),
                          parseInt( $scope.inputDeduction ) );

        // Projector.drawIncomeBar( 100000 );

    };

    /**
     * Export to scope
     */
    $scope.onFormSubmit = onFormSubmit;
    $scope.inputIncome = "120000";
    $scope.inputTaxWithheld= "35000";
    $scope.inputDeduction = TaxRates.deductions.single;
    
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


    var logger = Logger.getLogger("TheCanvas", {all: true} );
    logger.info("alive!");

    var theCanvasElement = document.getElementById("itc-canvas");
    var canvas = theCanvasElement.getContext("2d");

    /**
     * TODO
     */
    var incomeAxisX = 150;

    var fillStyleRefund = "#4c4";
    var fillStyleBill = "#c44";

    /**
     * @return the width of the canvas element
     */
    var getWidth = function() {
        return theCanvasElement.width;
    };

    /**
     * @return the height of the canvas element
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
     * fully clear the canvas
     */
    var clear = function() {
        canvas.translate(0,0);
        canvas.clearRect( 0, 0, getWidth(), getHeight() );
    };

    /**
     * Draw a line from from to to.
     */
    var drawLine = function(from, to) {
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
        translate(state.frame);
        canvas.fillStyle = state.fillStyle;
        canvas.fillRect( state.x,
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
        translate(state.frame);
        canvas.beginPath();
        canvas.strokeStyle = state.fillStyle;
        canvas.lineWidth = 0.5;
        drawLine( { x: state.x,            y: -state.y },
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
     * @param renderFn
     * @param iterateFn
     * @param state
     *
     * @return a promise that is resolved when the animation is complete.
     */
    var animate = function(renderFn, iterateFn, state) {
        logger.fine("animate: returning animation promise for state: " + JSON.stringify(state) );

        return $q( function(resolve, reject) {

            logger.fine("animate: starting animation for state: " + JSON.stringify(state) );
            var id = setInterval( function() {
                            
                                      canvas.save();
                                      renderFn( state );
                                      canvas.restore();

                                      if ( ! iterateFn( state ) ) {
                                          clearInterval(id);
                                          logger.fine("animate: ending animation for state: " + JSON.stringify(state) );
                                          resolve(state);
                                      }
                                  },
                                  5 );
        });
    };

    /**
     * @param a vararg list of functions
     *
     * @return the retval of the first function
     */
    var invokeAll = function() {
        logger.fine("invokeAll: arguments.length=" + arguments.length + ", arguments=" + JSON.stringify(arguments));
        var promises = _.map( arguments, function(arg) { return ( _.isFunction(arg) ) ? arg() : null } );
        return promises[0];
    };

    /**
     * canvas.translate(frame.x, frame.y)
     */
    var translate = function(frame) {
        canvas.translate(frame.x, frame.y);  // translate 0,0 to lower-left corner (instead of upper-left)
    };

    /**
     * Draw the vertical income axis.
     */
    var drawIncomeAxis = function() {
        canvas.save();

        translate( frame1 ); 
        canvas.beginPath();
        canvas.strokeStyle = "#888888";
        canvas.lineWidth = 1;
        drawLine( {x: getIncomeAxisX(), y: 0}, 
                  {x: getIncomeAxisX(),  y: -550 } );

        canvas.restore();
    };

    /**
     * Draw a solid x axis.
     */
    var drawXAxis = function() {
        canvas.save();

        translate( frame1 ); 
        canvas.beginPath();
        canvas.strokeStyle = "#888888";
        canvas.lineWidth = 1;
        drawLine( {x: getIncomeAxisX(), y: 0}, 
                  {x: getTaxWithheldBarX() + 120,  y: 0 } );

        canvas.restore();
    };

    
    /**
     * Draw x-axis labels
     */
    var drawXAxisLabels = function() {
        canvas.save();

        translate(frame0);
        canvas.font="14px Georgia";
        // canvas.strokeStyle = "#888";
        // canvas.strokeText( state.label, state.x, -1 * (state.y + 5) ); 
        canvas.fillStyle = "#888";
        canvas.textAlign = "start";
        canvas.fillText( "Income", getIncomeAxisX() + 10, -5);
        canvas.fillText( "Tax", getTaxBarX() + 10, -5);
        canvas.fillText( "Total Tax", getTotalTaxBarX() + 10, -5);  
        canvas.fillText( "Tax Withheld", getTaxWithheldBarX() + 10, -5);  

        canvas.restore();
    };

    /**
     * @return an array of animate() calls, for each of the tax brackets.
     */
    var buildBracketLineAnimations = function(income, ppdFn) {

        var brackets = TaxRates.getBrackets(income);

        var lineLength = 315;  // + 1 for the spacing between income bar and tax bar
        var x = getIncomeAxisLabelX();

        // Configure initial state(s).
        var states = _.map( brackets,
                            function(bracket) {
                                return { x: x,
                                         y: ppdFn( Math.min(bracket.top,income) ),
                                         l: 0,
                                         endLength: lineLength,
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
    var buildBracketLabelAnimations = function(income, ppdFn) {

        var brackets = TaxRates.getBrackets(income);

        var x = getIncomeAxisLabelX();

        // Configure initial state(s).
        var states = _.map( brackets,
                            function(bracket) {
                                return { label: $filter("currency")( Math.min(bracket.top,income), "$", 0 ), 
                                         rateLabel: bracket.rateLabel,
                                         x: x,
                                         y: ppdFn( Math.min(bracket.top,income) ) } ;
                            } );

        var renderFn = function(state) {
            translate(frame1);
            canvas.font="14px Georgia";
            // canvas.strokeStyle = "#888";
            // canvas.strokeText( state.label, state.x, -1 * (state.y + 5) ); 
            canvas.fillStyle = "#888";
            canvas.textAlign = "start";
            canvas.fillText( state.label, state.x, -1 * (state.y + 5) );  

            canvas.textAlign = "end";
            canvas.fillText( state.rateLabel, state.x + 95, -1 * (state.y - 15) );  
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
    var buildBracketTaxRateLabelAnimations = function(income, ppdFn) {

        var brackets = TaxRates.getBrackets(income);

        // Configure initial state(s).
        var states = _.map( brackets,
                            function(bracket) {
                                return { // label: genTaxRateLabel(bracket, income),
                                         label:  getTaxedAmountLabel(bracket, income),
                                         x: getTaxBarX() + 5,
                                         // y: ppdFn( Math.min(bracket.top,income) - (TaxRates.getBracketSize(bracket, income)/2) ) } ;
                                         // y: ppdFn( Math.min(bracket.top,income) ) - 15 } ;
                                         y: ppdFn( bracket.bottom + TaxRates.getTaxedAmount(bracket,income) ) + 5 } ;
                            } );

        var renderFn = function(state) {
            translate(frame1);
            canvas.font="14px Georgia";
            canvas.fillStyle = "#888";
            canvas.fillText( state.label, state.x, -1 * (state.y) );  
        };

        var iterateFn = function() { 
            return false; 
        };

        return _.map( states, function(state) { return _.partial(animate, renderFn, iterateFn, state); } );
    };

    /**
     * @return an animate call for the effective tax
     */
    var buildTotalTaxRateLabelAnimation = function(income, taxableIncome, ppdFn) {

        var brackets = TaxRates.getBrackets(taxableIncome);

        // compute total taxed amount and effective tax rate
        var totalTaxedAmount = _.reduce(brackets, 
                                        function( memo, bracket ) { return memo + TaxRates.getTaxedAmount(bracket, taxableIncome); }, 
                                        0 );
        totalTaxedAmount += TaxRates.getTaxedAmount( TaxRates.socialsecurity.single, taxableIncome );
        totalTaxedAmount += TaxRates.getTaxedAmount( TaxRates.medicare.single, taxableIncome );

        var effectiveTaxRate =  Math.round( totalTaxedAmount / income  * 100 );

        logger.fine("buildTotalTaxRateLabelAnimation: totalTaxedAmount=" + totalTaxedAmount 
                                                 + ", effectiveTaxRate=" + effectiveTaxRate 
                                                 + ", taxableIncome=" + taxableIncome
                                                 + ", income=" + income );

        // Configure initial state(s).
        var state = {   label: $filter("currency")( totalTaxedAmount, "$", 0) + " (" +  effectiveTaxRate + "%)",
                        // topLabel: "Tax Total",
                        x: getTotalTaxBarX() + 5,
                        // y: ppdFn( Math.min(bracket.top,income) - (TaxRates.getBracketSize(bracket, income)/2) ) } ;
                        // y: ppdFn( Math.min(bracket.top,income) ) - 15 } ;
                        y: ppdFn( totalTaxedAmount ) + (brackets.length + 2) + 5  // account for extra pixels between brackets
                        // topY: ppdFn( totalTaxedAmount ) + 20
                    } ;

        var renderFn = function(state) {
            translate(frame1);
            canvas.font="14px Georgia";
            canvas.fillStyle = "#888";
            canvas.fillText( state.label, state.x, -1 * (state.y) );  
            // canvas.fillText( state.topLabel, state.x, -1 * (state.topY) );  
        };

        var iterateFn = function() { 
            return false; 
        };

        return _.partial(animate, renderFn, iterateFn, state); 
    };

    /**
     * @return an animate() function, for the deduction bar
     */
    var buildDeductionBarAnimation = function(income, deduction, ppdFn) {

        var barWidth = 100;

        var taxableIncome = income - deduction;

        // Configure initial state(s).
        var state = { x: getIncomeBarX(),
                       y: ppdFn(taxableIncome) + 1,
                       w: barWidth,
                       h: 0,
                       endHeight: ppdFn( deduction )
                     };

        state.fillStyle = TaxRates.deductionFillStyle;

        logger.fine("buildDeductionBarAnimation: state=" + JSON.stringify(state));

        // Render function - draw the bar for income
        var renderFn = function(state) {
            translate(frame1);
            canvas.fillStyle = state.fillStyle;
            canvas.fillRect( state.x,
                             -1 * state.y,
                             state.w,
                             -1 * state.h );
            
        };

        // iterate function 
        // @return true to continue animation; false to end animation
        var iterateFn = function(state) {
            state.h += 1;
            return (state.h < state.endHeight) ;
        };

        return _.partial(animate, renderFn, iterateFn, state);
    };

    /**
     * @return an animate() function, for the top income line (including deduction)
     */
    var buildIncomeLineAnimation = function(income, ppdFn) {

        var lineLength = 215;  // + 1 for the spacing between income bar and tax bar
        var x = getIncomeAxisLabelX();

        // Configure initial state(s).
        var state = {  x: getIncomeAxisLabelX(),
                       y: ppdFn( income ),
                       l: 0,
                       endLength: lineLength,
                       frame: frame1,
                       fillStyle: "#888"
                     };

        logger.fine("buildIncomeLineAnimation: state=" + JSON.stringify(state));

        return _.partial( animate, lineRenderFn, lineIterateFn, state ); 
    };

    /**
     * @return an animate() function, for rendering the income label
     */
    var buildIncomeLabelAnimation = function(income, ppdFn) {

        var x = getIncomeAxisLabelX();

        // Configure initial state(s).
        var state = { label: $filter("currency")( income, "$", 0 ), 
                      rateLabel: "0%",
                      x: getIncomeAxisLabelX(),
                      y: ppdFn( income ) 
                    } ;

        var renderFn = function(state) {
            translate(frame1);
            canvas.font="14px Georgia";
            // canvas.strokeStyle = "#888";
            // canvas.strokeText( state.label, state.x, -1 * (state.y + 5) ); 
            canvas.fillStyle = "#888";
            canvas.textAlign = "start";
            canvas.fillText( state.label, state.x, -1 * (state.y + 5) );  

            canvas.textAlign = "end";
            canvas.fillText( state.rateLabel, state.x + 95, -1 * (state.y - 15) );  
        };

        var iterateFn = function() { 
            return false; 
        };

        return _.partial(animate, renderFn, iterateFn, state); 
    };

    /**
     * @return an array of animate() functions, for each of the tax brackets.
     */
    var buildIncomeBarAnimations = function(income, ppdFn) {

        var barWidth = 100;

        var brackets = TaxRates.getBrackets(income);

        logger.fine("buildIncomeBarAnimations: brackets=" + JSON.stringify(brackets));

        // Configure initial state(s).
        var states = _.map( brackets,
                            function(bracket) {
                                return { x: getIncomeBarX(),
                                         y: ppdFn( bracket.bottom ) + 1,
                                         w: barWidth,
                                         h: 0,
                                         endHeight: ppdFn( Math.min(bracket.top,income) - bracket.bottom ),
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
    var buildSocialSecurityTaxBarAnimation = function(income, ppdFn) {

        var barWidth = 100;
        var x = getSocialSecurityTaxBarX();

        var bracket = TaxRates.socialsecurity.single;

        var state = { x: x,
                      y: ppdFn( TaxRates.getBracketTop( bracket,income) ) -1 ,
                      w: barWidth,
                      h: 0,
                      endHeight: ppdFn( TaxRates.getTaxedAmount(bracket, income) ),
                      fillStyle:  TaxRates.socialsecurityFillStyle,
                      frame: frame1
                    };

        logger.fine("buildSocialSecurityTaxBarAnimations: state=" + JSON.stringify(state));

        return _.partial(animate, barRenderFn, descBarIterateFn, state); 
    };


    /**
     * This method is for the 2nd column of tax bars, stacked on top of each
     * other to show the total tax.
     *
     * @return an animate() call for social security tax bar (under effective tax rate)
     *
     */
    var buildSocialSecurityTaxBarAnimation2 = function(income, ppdFn) {

        var barWidth = 100;

        // Configure initial state(s).
        var totalTaxedAmount = _.reduce(TaxRates.getBrackets(income),
                                        function( memo, bracket ) { return memo + TaxRates.getTaxedAmount(bracket, income); }, 
                                        0 );

        // Need to add 1 pixel per bracket to account for the pixel of space between
        // the bracket bars.
        var prevTopPixel = ppdFn( totalTaxedAmount ) + TaxRates.getBrackets(income).length;

        var bracket = TaxRates.socialsecurity.single;
        var state = { x: getTotalTaxBarX(),
                       y: prevTopPixel + 1,
                       w: barWidth,
                       h: 0,
                       endHeight: ppdFn( TaxRates.getTaxedAmount(bracket, income) ),
                       fillStyle:  TaxRates.socialsecurityFillStyle,
                       frame: frame1
                     };


        logger.fine("buildSocialSecurityTaxBarAnimations2: state=" + JSON.stringify(state));

        return _.partial(animate, barRenderFn, barIterateFn, state); 
    };


    /**
     * @return an animate() call, for social security
     */
    var buildSocialSecurityTaxRateLabelAnimation = function(income, ppdFn) {

        var bracket = TaxRates.socialsecurity.single;

        // Configure state.
        var state = { label: getTaxedAmountLabel(bracket, income),
                      topLabel: getBracketTopLabel(bracket, income),
                      topTopLabel: "Social Security",
                      x: getSocialSecurityTaxBarX(),
                      topY: ppdFn( TaxRates.getBracketTop( bracket,income) ) + 7,
                      topTopY: ppdFn( TaxRates.getBracketTop( bracket,income) ) + 20,
                      y: ppdFn( TaxRates.getBracketTop( bracket,income) ) - ppdFn( TaxRates.getTaxedAmount(bracket, income) ) - 15
                    };

        var renderFn = function(state) {
            translate(frame1);
            canvas.font="14px Georgia";
            canvas.fillStyle = TaxRates.socialsecurityFillStyle ;
            canvas.fillText( state.topTopLabel, state.x, -1 * (state.topTopY) );  
            canvas.fillText( state.topLabel, state.x, -1 * (state.topY) );  
            canvas.fillText( state.label, state.x, -1 * (state.y) );  
        };

        var iterateFn = function() { 
            return false; 
        };

        return _.partial(animate, renderFn, iterateFn, state);
    };

    /**
     * @return an array of animate() calls, for each of the tax brackets.
     */
    var buildSocialSecurityLineAnimation = function(income, ppdFn) {

        var bracket = TaxRates.socialsecurity.single;

        // Configure initial state.
        var state = { x: getIncomeAxisLabelX(),
                      y: ppdFn( TaxRates.getBracketTop(bracket, income) ) + 1,
                      l: 0,
                      endLength: getSocialSecurityTaxLineLength(),
                      fillStyle: TaxRates.socialsecurityFillStyle,
                      frame: frame1,
                    };
                    
        logger.fine("buildSocialSecurityLineAnimation: state=" + JSON.stringify(state));

        return _.partial( animate, lineRenderFn, lineIterateFn, state ); 
    };

    /**
     * @return an animate() call for the medicare bracket.
     *
     */
    var buildMedicareTaxBarAnimation = function(income, ppdFn) {

        var barWidth = 100;
        var bracket = TaxRates.medicare.single;

        var state = { x: getMedicareTaxBarX(),
                      y: ppdFn( TaxRates.getBracketTop( bracket,income) ) ,
                      w: barWidth,
                      h: 0,
                      endHeight: ppdFn( TaxRates.getTaxedAmount(bracket, income) ),
                      fillStyle:  TaxRates.medicareFillStyle,
                      frame: frame1
                    };

        logger.fine("buildMedicareTaxBarAnimations: state=" + JSON.stringify(state));

        return _.partial(animate, barRenderFn, descBarIterateFn, state); 
    };


    /**
     * This method is for the 2nd column of tax bars, stacked on top of each
     * other to show the total tax.
     *
     * @return an animate() call for medicare tax bar (under effective tax rate)
     *
     */
    var buildMedicareTaxBarAnimation2 = function(income, ppdFn) {

        var barWidth = 100;

        // Configure initial state(s).
        var totalTaxedAmount = _.reduce(TaxRates.getBrackets(income),
                                        function( memo, bracket ) { return memo + TaxRates.getTaxedAmount(bracket, income); }, 
                                        0 );
        totalTaxedAmount += TaxRates.getTaxedAmount( TaxRates.socialsecurity.single, income );
        
        // Need to add 1 pixel per bracket to account for the pixel of space between
        // the bracket bars (and 1 pixel for the social security brakcet)
        var prevTopPixel = ppdFn( totalTaxedAmount ) + TaxRates.getBrackets(income).length + 1;

        var bracket = TaxRates.medicare.single;
        var state = { x: getTotalTaxBarX(),
                       y: prevTopPixel + 1,
                       w: barWidth,
                       h: 0,
                       endHeight: ppdFn( TaxRates.getTaxedAmount(bracket, income) ),
                       fillStyle:  TaxRates.medicareFillStyle,
                       frame: frame1
                     };


        logger.fine("buildMedicareTaxBarAnimations2: state=" + JSON.stringify(state));

        return _.partial(animate, barRenderFn, barIterateFn, state); 
    };


    /**
     * @return an animate() call, for medicare
     */
    var buildMedicareTaxRateLabelAnimation = function(income, ppdFn) {

        var bracket = TaxRates.medicare.single;

        // Configure state.
        var state = { label: getTaxedAmountLabel(bracket, income),
                      topLabel: getBracketTopLabel(bracket, income),
                      topTopLabel: "Medicare",
                      x: getMedicareTaxBarX(),
                      topY: ppdFn( TaxRates.getBracketTop( bracket,income) ) + 7,
                      topTopY: ppdFn( TaxRates.getBracketTop( bracket,income) ) + 20,
                      y: ppdFn( TaxRates.getBracketTop( bracket,income) ) - ppdFn( TaxRates.getTaxedAmount(bracket, income) ) - 15
                    };

        var renderFn = function(state) {
            translate(frame1);
            canvas.font="14px Georgia";
            canvas.fillStyle = TaxRates.medicareFillStyle;
            canvas.fillText( state.topTopLabel, state.x, -1 * (state.topTopY) );  
            canvas.fillText( state.topLabel, state.x, -1 * (state.topY) );  
            canvas.fillText( state.label, state.x, -1 * (state.y) );  
        };

        var iterateFn = function() { 
            return false; 
        };

        return _.partial(animate, renderFn, iterateFn, state);
    };

    /**
     * @return an array of animate() calls, for the medicare tax brackets.
     */
    var buildMedicareLineAnimation = function(income, ppdFn) {

        var bracket = TaxRates.medicare.single;

        // Configure initial state.
        var state = { x: getIncomeAxisLabelX(),
                      y: ppdFn( TaxRates.getBracketTop( bracket,income) ) + 2,
                      l: 0,
                      endLength: getMedicareTaxLineLength(),
                      fillStyle: TaxRates.medicareFillStyle,
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
    var buildTaxBarAnimations2 = function(income, ppdFn) {

        var barWidth = 100;

        var brackets = TaxRates.getBrackets(income);

        // Configure initial state(s).
        var prevTopPixel = 0;
        var states = _.map( brackets,
                            function(bracket) {
                                var retMe = { x: getTotalTaxBarX(),
                                              y: prevTopPixel + 1,
                                              w: barWidth,
                                              h: 0,
                                              endHeight: ppdFn( TaxRates.getTaxedAmount(bracket, income) ),
                                              frame: frame1
                                            };
                                prevTopPixel = retMe.y + ppdFn( TaxRates.getTaxedAmount(bracket,income) );
                                return retMe;
                            } );

        for (var i=0; i < states.length; ++i) {
            states[i].fillStyle = TaxRates.bracketFillStyles[i];
        }

        logger.fine("buildTaxBarAnimations2: states=" + JSON.stringify(states));

        return _.map( states, function(state) { return _.partial(animate, barRenderFn, barIterateFn, state); } );
    };

    /**
     * @return an array of animate() calls, for each of the tax brackets.
     */
    var buildTaxBarAnimations = function(income, ppdFn) {

        var barWidth = 100;

        var brackets = TaxRates.getBrackets(income);

        // Configure initial state(s).
        var states = _.map( brackets,

                            function(bracket) {
                                return { x: getTaxBarX(),
                                         y: ppdFn( bracket.bottom ) + 1,
                                         w: barWidth,
                                         h: 0,
                                         endHeight: ppdFn( TaxRates.getTaxedAmount(bracket, income) ),
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
    var buildTaxWithheldBarAnimation = function(income, withheld, ppdFn) {

        var barWidth = 100;

        // Configure initial state(s).
        var totalTaxedAmount = _.reduce(TaxRates.getBrackets(income), 
                                        function( memo, bracket ) { return memo + TaxRates.getTaxedAmount(bracket, income); }, 
                                        0 );
        totalTaxedAmount += TaxRates.getTaxedAmount( TaxRates.socialsecurity.single, income );
        totalTaxedAmount += TaxRates.getTaxedAmount( TaxRates.medicare.single, income );

        if (totalTaxedAmount < withheld) {
            // Refund!
            endHeight0 = ppdFn( totalTaxedAmount ) + TaxRates.getBrackets(income).length + 1;   // account for extra pixels between brackets
            endHeight1 = ppdFn( withheld - totalTaxedAmount );
            fillStyle1 = fillStyleRefund;
        } else {
            // bill
            endHeight0 = ppdFn( withheld );
            endHeight1 = ppdFn( totalTaxedAmount - withheld ) + TaxRates.getBrackets(income).length + 1; // account for extra pixles betwen brackets
            fillStyle1 = fillStyleBill;
        }

        var states = [ {  x: getTaxWithheldBarX(),
                          y: 0 + 1,
                          w: barWidth,
                          h: 0,
                          endHeight: endHeight0,
                          fillStyle:  "#ddd",
                          frame: frame1
                       } ,
                       { 
                          x: getTaxWithheldBarX(),
                          y: endHeight0 + 2,
                          w: barWidth,
                          h: 0,
                          endHeight: endHeight1,
                          fillStyle: fillStyle1,
                          frame: frame1
                       }
                    ];

        logger.fine("buildTaxWithheldBarAnimation: states=" + JSON.stringify(states));

        return _.map( states, function(state) { return _.partial(animate, barRenderFn, barIterateFn, state); } );
    };

    /**
     * @return an animate call for the effective tax
     */
    var buildTaxWithheldLabelAnimation = function(income, withheld, ppdFn) {

        // compute total taxed amount
        var totalTaxedAmount = _.reduce(TaxRates.getBrackets(income), 
                                        function( memo, bracket ) { return memo + TaxRates.getTaxedAmount(bracket, income); }, 
                                        0 );
        totalTaxedAmount += TaxRates.getTaxedAmount( TaxRates.socialsecurity.single, income );
        totalTaxedAmount += TaxRates.getTaxedAmount( TaxRates.medicare.single, income );

        // Match text color with refund/bill
        var fillStyle = (totalTaxedAmount < withheld) ? fillStyleRefund : fillStyleBill;
        var taxDiff = Math.abs( totalTaxedAmount - withheld );
        var label = (totalTaxedAmount < withheld) ? "Refund" : "Bill"; 

        logger.fine("buildTaxWithheldLabelAnimation: totalTaxedAmount=" + totalTaxedAmount );

        // Configure initial state(s).
        var state = {   label: label + ": " + $filter("currency")( taxDiff, "$", 0),
                        x: getTaxWithheldBarX() + 1,
                        // y: ppdFn( Math.min(bracket.top,income) - (TaxRates.getBracketSize(bracket, income)/2) ) } ;
                        // y: ppdFn( Math.min(bracket.top,income) ) - 15 } ;
                        y: ppdFn( Math.max( totalTaxedAmount, withheld)) + 10 ,
                        // topY: ppdFn( totalTaxedAmount ) + 20
                        fillStyle: fillStyle
                    } ;

        var renderFn = function(state) {
            translate(frame1);
            canvas.font="16px Georgia";
            canvas.fillStyle = state.fillStyle;
            canvas.fillText( state.label, state.x, -1 * (state.y) );  
            // canvas.fillText( state.topLabel, state.x, -1 * (state.topY) );  
        };

        var iterateFn = function() { 
            return false; 
        };

        return _.partial(animate, renderFn, iterateFn, state); 
    };




    /**
     * Draw on the canvas.
     * @return promise that is resolved when all animations are complete.
     */
    var redraw = function(income, withheld, deduction) {

        logger.fine("redraw: theCanvasElement.height=" + theCanvasElement.height + ", theCanvasElement.width=" + theCanvasElement.width);

        clear();

        drawIncomeAxis();
        drawXAxis();
        drawXAxisLabels();

        income = income || 100000;
        withheld = withheld || 30000;
        deduction = deduction || TaxRates.deductions.single;

        var taxableIncome = income - deduction;

        var ppdFn = Projector.ppd( getHeight() - 100, income);    // height of income bar

        // Build the animation functions
        // -rx- var incomeBarAnimations = buildIncomeBarAnimations(income, ppdFn);
        var incomeBarAnimations = buildIncomeBarAnimations(taxableIncome, ppdFn);
        incomeBarAnimations.push( buildDeductionBarAnimation(income, deduction, ppdFn) );

        var bracketLineAnimations = buildBracketLineAnimations(taxableIncome, ppdFn);
        bracketLineAnimations.push( buildIncomeLineAnimation(income, ppdFn) );

        var bracketLabelAnimations = buildBracketLabelAnimations(taxableIncome, ppdFn);
        bracketLabelAnimations.push( buildIncomeLabelAnimation(income, ppdFn) );

        // Group together animations that will run in parallel
        var animations = [];
        for (var i=1; i < incomeBarAnimations.length; ++i) {
            animations.push( _.partial( invokeAll, incomeBarAnimations[i], bracketLineAnimations[i-1], bracketLabelAnimations[i-1] ) );
        }
        animations.push( _.partial( invokeAll, bracketLineAnimations[i-1], bracketLabelAnimations[i-1] ) );

        // Build a series of promises to invoke the animations.
        var retMe = Promise.resolve(1);
        _.each( animations, function(animation) { retMe = retMe.then( animation ); } );

        // -rx- _.each( buildTaxBarAnimations(income, ppdFn), function(animation) { retMe = retMe.then( animation ); } );
        // -rx- _.each( buildTaxBarAnimations2(income, ppdFn), function(animation) { retMe = retMe.then( animation ); } );
        var taxBarAnimations = buildTaxBarAnimations(taxableIncome, ppdFn); 
        var taxBarAnimations2 = buildTaxBarAnimations2(taxableIncome, ppdFn); 

        retMe = retMe.then( _.partial( invokeAll, 
                                       taxBarAnimations[0],
                                       taxBarAnimations2[0],
                                       buildSocialSecurityLineAnimation(taxableIncome,ppdFn)
                                      ) );

        for (var i=1; i < taxBarAnimations.length; ++i) {
            retMe = retMe.then( _.partial( invokeAll, 
                                           taxBarAnimations[i],
                                           taxBarAnimations2[i] ) );
        } 

        _.each( buildBracketTaxRateLabelAnimations(taxableIncome, ppdFn), function(animation) { retMe = retMe.then( animation ); } );

        // -rx- retMe = retMe.then( buildSocialSecurityLineAnimation(income, ppdFn) )
        retMe = retMe.then( _.partial( invokeAll, 
                                       buildSocialSecurityTaxBarAnimation(taxableIncome, ppdFn), 
                                       buildSocialSecurityTaxBarAnimation2(taxableIncome, ppdFn)
                                       ) )
                     .then( buildSocialSecurityTaxRateLabelAnimation(taxableIncome, ppdFn) );

        retMe = retMe.then( buildMedicareLineAnimation(taxableIncome, ppdFn) )
        retMe = retMe.then( _.partial( invokeAll, 
                                       buildMedicareTaxBarAnimation(taxableIncome, ppdFn), 
                                       buildMedicareTaxBarAnimation2(taxableIncome, ppdFn) ) )
                     .then( buildMedicareTaxRateLabelAnimation(taxableIncome, ppdFn) )
                     .then( buildTotalTaxRateLabelAnimation(income, taxableIncome, ppdFn) )


       _.each( buildTaxWithheldBarAnimation(taxableIncome, withheld, ppdFn), function(animation) { retMe = retMe.then(animation); } );
        retMe = retMe.then( buildTaxWithheldLabelAnimation(taxableIncome, withheld, ppdFn) );

        return retMe;
        
    };

    /**
     * Export API
     */
    return {
        redraw: redraw,
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

    var logger = Logger.getLogger("TaxRates", {all: true} );
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

                                // -rx- "#8181F7",
                                // -rx- "#A9A9F5",
                                // -rx- "#A9D0F5",
                                // -rx- "#A9F5E1",
                                // -rx- "#81F7BE",
                                // -rx- "#A9F5A9",
                                // -rx- "#F5F6CE",
                                // -rx- "#F6CECE" ];

                                // -rx- "#F6CECE",
                                // -rx- "#F5D0A9",
                                // -rx- "#F2F5A9",
                                // -rx- "#BCF5A9",
                                // -rx- "#A9F5F2",
                                // -rx- "#A9D0F5",
                                // -rx- "#819FF7",
                                // -rx- "#8181F7" ].reverse() ;
    
    // -rx- var bracketFillStyles = [ "#000",
    // -rx-                           "#00f",
    // -rx-                           "#0ff",
    // -rx-                           "#0f0",
    // -rx-                           "#ff0",
    // -rx-                           "#f44",
    // -rx-                           "#f00",
    // -rx-                           "#f8f" ];

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

