class TextSpinner {
    options = {
        // radius of the circles. ranging from 0 (= 0) to 1 (= container.height / 2) and onwards
        circleRadius_range: 0.3,
        // distance of each circle's center to the container center. ranging from 0 (= 0) to 1 (= container.height / 2) and onwards
        circleDistance_range: 1,
        // the ratio at which the circle will shrink when spinning. ranging from 0 (no shrink) to 1 (shrink to radius 0)
        circleShrinkRate: 0.5,

        text: "",
        fontSize: 30,
        fontFile: null,
        horizontalAlignment: "left",
        verticalAlignment: "top",
        // takes into account the overflow caused by the circles when placing the text near a border
        includeOverflowInViewbox: true,
        // attributes to be assigned to each path
        pathAttrs: { },
        drawDebugBox: false
    }

    get circleRadius() {
        return this.options.circleRadius_range * this._ogBoxContainer.height / 2;
    }
    get circleDistance() {
        return this.options.circleDistance_range * this._ogBoxContainer.height / 2;
    }

    timings = {
        letterToCircleTransition: { ms: 300, easing: 'easein' },
        delayBetweenLetterTransitions: 60,
        circleToLetterTransition: { ms: 300, easing: 'easeout' },
        delayBetweenLetterTransitions_stop: 0,
        delayBetweenLetterTransitions_start: undefined,
        letterCircleSpin: { ms: 1200, easing: 'easeInOutQuad' },
        containerSpin: { ms: 3000, easing: 'linear' }
    };

    _letters = new Letters();
    _animID = 0;
    _sSvg; _sContainer; // s stands for snap object
    _ogBoxContainer;
    _debugBox;

    constructor(svg_id, options) {
        if (!svg_id) {
            throw "Invalid svg ID.";
        }
        
        var svg = document.querySelector("#" + svg_id);
        if (!svg || svg.nodeName !== "svg") {
            throw "SVG element not found.";
        }
        
        // parse options first and then data in svg attributes so that they have priority
        this.parseOptions(options);
        this.parseOptions(svg.dataset);
        // freeze options so they can't change later
        Object.deepFreeze(this.options);

        this.setup(svg);
    }
    
    async setup(svg) {
        if (this._sSvg || this._sContainer) return; // make sure this is only ran at init

        await this.injectScripts();
        svg = $(svg);

        // load svg path letters
        var otFont = await opentype.load(this.options.fontFile); // ot stands for opentype object
        var otPaths = otFont.getPaths(this.options.text, 0, 0, this.options.fontSize);
        var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        svg[0].appendChild(g);

        // append paths to container
        for (let otPath of otPaths) {

            // do not append empty paths
            if (otPath.commands?.length > 0) {

                var element = otPath.toDOMElement(2);
                g.append(element);

                // append letter object to _letters
                this._letters.push({
                    snapObj: Snap(element),
                    state: "stopped",
                    character: otPath.character,
                    unicode: otPath.unicode
                });
            }
        }
        
        this._sSvg = Snap(svg[0]);
        this._sContainer = Snap(g);

        var gBox = this._ogBoxContainer = this._sContainer.getBBox();
        var svgBox = this._sSvg.node.getBoundingClientRect();
        
        // assign correct viewbox
        var viewBox = { x: 0, y: 0, width: svgBox.width, height: svgBox.height };

        switch (this.options.horizontalAlignment) {
            case 'right':
                if (this.options.includeOverflowInViewbox)
                    viewBox.x = -(svgBox.width - (gBox.width + Math.max(0, this.circleDistance + this.circleRadius - gBox.width / 2))) + gBox.x;
                else
                    viewBox.x = -(svgBox.width - gBox.width) + gBox.x;
                break;
            case 'center':
                viewBox.x = -(svgBox.width - gBox.width) / 2 + gBox.x;
                break;
            case 'left':
            case undefined: // defaults to left
                if (this.options.includeOverflowInViewbox)
                    viewBox.x = -Math.max(0, this.circleDistance + this.circleRadius - gBox.width / 2);
                else
                    viewBox.x = gBox.x;
                break;
        }
        
        switch (this.options.verticalAlignment) {
            case 'bottom':
                if (this.options.includeOverflowInViewbox)
                    viewBox.y = -(svgBox.height- (gBox.height + Math.max(0, this.circleDistance + this.circleRadius - gBox.height / 2))) + gBox.y;
                else
                    viewBox.y = gBox.y - (svgBox.height - gBox.height);
                break;
            case 'center':
                viewBox.y = gBox.y - (svgBox.height - gBox.height) / 2;
                break;
            case 'top':
            case undefined: // defaults to top
                if (this.options.includeOverflowInViewbox)
                    viewBox.y = gBox.y - Math.max(0, this.circleDistance + this.circleRadius - gBox.height / 2);
                else
                    viewBox.y = gBox.y;
                break;
        }
        
        svg.attr("viewBox", `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);

        // assign path attributes
        var pathAttrs = Object.entries(this.options.pathAttrs);
        if (pathAttrs && pathAttrs.length !== 0) {
            for (let path of this._letters) {
                for (const [key, value] of pathAttrs) {
                    path.snapObj.attr(key, value);
                }
            }
        }
        
        if (this.options?.drawDebugBox) this.drawDebugBox();

        // calculate and save paths for animation
        for (let letter of this._letters) {
            letter.paths = {
                original: letter.snapObj.attr("d"),
                circle: this.generateLetterToCircleAnimation(letter.snapObj)
            };
        }

        // override default easing functions with parameters for mapping the [0,1] input range to an arbitrary [min,max] output range
        for (let [key, value] of Object.entries(mina)) {
            if (typeof value === "function" && key !== "time" && key !== "getById" && !key.endsWith("Back")) {
                mina[key] = function(n, min = 0, max = 1) {
                    return value(min + ((max - min) / (1 - 0)) * (n - 0));
                }
            }
        }
    }

    // injects the required scripts if not already included
    async injectScripts() {
        var requiredScripts = {
            jQuery: "https://code.jquery.com/jquery-3.6.0.min.js",
            Snap: "https://cdn.jsdelivr.net/npm/snapsvg@0.4.0/dist/snap.svg.min.js",
            opentype: "https://rawcdn.githack.com/TechnoZamb/opentype.js/5896bc8a1098c616f43be1b162418f3446febdba/dist/opentype.min.js",
            flatten: "https://gist.githack.com/TechnoZamb/9b4e6aee200b72a224d79a1f234407bc/raw/2bce483fa7e198638504e465fb22e902ff717c74/flatten.js",
            easings: "https://rawcdn.githack.com/overjase/snap-easing/3b6125b59c9409b199881887eebfeee4dd65bcf3/snap.svg.easing.js",
        };
        
        var script = document.createElement("script");
        var promises = [];

        var loadScript = (s) => {
            script = document.createElement("script");
            script.src = s;
            script.type = "text/javascript";
            script.defer = "defer";
            promises.push(new Promise(r => script.onload = r));
            document.head.appendChild(script);
        };

        if (!window.jQuery) loadScript(requiredScripts.jQuery);
        if (window.Snap?.version !== '0.4.0') {
            delete window.Snap; loadScript(requiredScripts.Snap);
        }
        if (!window.opentype) loadScript(requiredScripts.opentype);
        if (!window.flatten) loadScript(requiredScripts.flatten);
        if (!window.mina?.easeInOutQuad) loadScript(requiredScripts.easings);
        
        return Promise.all(promises);
    }

    // parses and validates options
    parseOptions(options) {
        if (!options) return;

        for (const [key, value] of Object.entries(options)) {
            switch (key) {
                case 'fill': case 'stroke': case 'strokeWidth':
                    if (!this.options.pathAttrs) this.options.pathAttrs = {};
                    this.options.pathAttrs[key] = value;
                    break;

                case 'timings':
                    this.timings = value;
                    break;

                case 'circleRadius_range': case 'circleRadiusRange':
                    if (value < 0) throw 'The circle radius must be 0 or higher.';
                    else this.options['circleRadius_range'] = value;
                    break;

                case 'circleDistance_range': case 'circleDistanceRange':
                    if (value < 0) throw 'The circle distance must be 0 or higher.';
                    else this.options['circleDistance_range'] = value;
                    break;

                case 'circleShrinkRate':
                    if (value < 0 || value > 1) throw 'The circle shrink rate must be between 0 and 1 inclusive.';
                    else this.options[key] = value;
                    break;

                case 'horizontalAlignment':
                    var values = ['left', 'center', 'right'];
                    if (!values.includes(value)) throw `'horizontalAlignment' must be either '${values.join("', '")}'.`;
                    else this.options[key] = value;
                    break;

                case 'verticalAlignment':
                    var values = ['top', 'center', 'bottom'];
                    if (!values.includes(value)) throw `'verticalAlignment' must be either '${values.join("', '")}'.`;
                    else this.options[key] = value;
                    break;

                default:
                    this.options[key] = value;
                    break;
            }
        }
    }

    startAnimation() {
        if (this._letters.overallState !== "stopped") return;
        
        // if _animID "overflows", loop back to 0
        this._animID = this._animID + 1 !== this._animID ? this._animID + 1 : 0;
        this.animateLettersToCircles(this._animID);
    }

    async stopAnimation() {
        if (this._letters.overallState === "stopped" || this._letters.overallState === "stopping") return;

        // if _animID "overflows", loop back to 0
        this._animID = this._animID + 1 !== this._animID ? this._animID + 1 : 0;

        this._sContainer.stop();
        flatten(this._sContainer.node);
        // refresh letters after flatten
        this._letters.setProperty("snapObj", this._sContainer.selectAll("path").items);

        // center position of one of the circles when at rotation = 0 (and container rotation = 0)
        var circleStartPos = [this._ogBoxContainer.cx, this._ogBoxContainer.cy - this.circleDistance];

        // sort circles from left to right
        var circles_lToR = [];
        for (let letter of this._letters) {

            // stop animation now to prevent the element changing position later
            letter.snapObj.stop();

            var bbox = letter.snapObj.node.getBBox();

            for (let i = 0; i < circles_lToR.length + 1; i++) {
                if (bbox.x < (circles_lToR[i]?.b.x ?? bbox.x + 1)) {

                    // 'snapObj' and 'state' properties are required instead of the letter object itself for pointers reasons
                    circles_lToR.splice(i, 0, { b: bbox, snapObj: letter.snapObj, state: letter.state });
                    break;
                } 
            }
        }

        // re-append elements in new order
        this._sContainer.node.innerHTML = null;

        for (let i = 0; i < circles_lToR.length; i++) {
            this._sContainer.node.appendChild(circles_lToR[i].snapObj.node);
            this._letters[i].snapObj = circles_lToR[i].snapObj;
            this._letters[i].state = circles_lToR[i].state;
        }

        var lastTransitionStart;

        // animate letters
        for (let i = 0; i < this._letters.length; i++) {

            // await a total of delayBetweenLetterTransitions ms, including other time spent computing
            if (i !== 0)
                await this.sleep(Math.max(0, (this.timings.delayBetweenLetterTransitions_stop ?? this.timings.delayBetweenLetterTransitions)
                    - (Date.now() - lastTransitionStart)));

            var letter = this._letters[i];

            // if the letter has finished its letter-to-circle animation, its path was set to a simplified one.
            // set it back to the original one + transforms for the current position.
            if (letter.state === "playing") {
                var b = circles_lToR[i].b;
                var s = `t${(b.x + b.width / 2) - circleStartPos[0]},${(b.y + b.width / 2) - circleStartPos[1]}`;

                if (this.options.circleShrinkRate !== 0) {
                    var shrinkValue = letter.snapObj.attr("shrinkValue") ?? 1;
                    s += `s${shrinkValue},${shrinkValue},${this._ogBoxContainer.cx},${this._ogBoxContainer.cy - this.circleDistance}`;
                }
                
                letter.snapObj.attr({ d: letter.paths.circle, transform: s });
            }
                
            letter.snapObj = Snap(flatten(letter.snapObj.node));
            letter.state = "stopping";
            letter.snapObj.letter = letter; // this is the only way to have a reference to letter inside the next animation finished function
            letter.snapObj.animate({ d: letter.paths.original }, this.timings.circleToLetterTransition.ms, mina[this.timings.circleToLetterTransition.easing], function() {

                // set it back to the original path and stopped state
                this.attr("d", this.letter.paths.original);
                this.letter.state = "stopped";
            });

            lastTransitionStart = Date.now();
        }
    }

    // animates letters into circles animations
    async animateLettersToCircles(animID) {
        var lastTransitionStart;
        
        for (let i = 0; i < this._letters.length; i++) {

            if (i !== 0)
                await this.sleep(Math.max(0, (this.timings.delayBetweenLetterTransitions_start ?? this.timings.delayBetweenLetterTransitions)
                    - (Date.now() - lastTransitionStart)));

            if (animID !== this._animID || this._letters[i].state !== "stopped") return;

            // set letter state to "starting" and animate
            this._letters[i].state = "starting";
            this._letters[i].snapObj.animate({ d: this._letters[i].paths.circle }, this.timings.letterToCircleTransition.ms, mina[this.timings.letterToCircleTransition.easing], () => function(letter, context) {

                if (animID !== context._animID || letter.state !== "starting") return;

                // set letter state to "playing"
                letter.state = "playing";

                // set easier path to animate for spinning
                letter.snapObj.attr("d", `M ${context._ogBoxContainer.cx - context.circleRadius},${context._ogBoxContainer.cy - context.circleDistance} a ${context.circleRadius},${
                    context.circleRadius} 0 1,0 ${context.circleRadius * 2},0 a ${context.circleRadius},${context.circleRadius} 0 1,0 ${-context.circleRadius * 2},0`);
            
                // if shrinking is enabled, spin and shrink, otherwise just spin
                if (context.options.circleShrinkRate !== 0)
                    context.animateCircleShrink(animID, letter);
                else
                    context.animateCircleSpin(animID, letter);

                // if all letters were animated, start spinning
                if (context._letters.overallState === "playing") {
                    context.animateContainerSpin(animID);
                }
            }(this._letters[i], this));
            
            lastTransitionStart = Date.now();
        }
    }
    
    // TODO - better version to debug
    /*async animateLettersToCircles(animID) {
        var lastTransitionStart;
        
        for (let i = 0; i < this._letters.length; i++) {

            if (animID !== this._animID || this._letters[i].state !== "stopped") return;

            // await a total of delayBetweenLetterTransitions ms, including other time spent computing
            if (i !== 0)
                await this.sleep(Math.max(0, (this.timings.delayBetweenLetterTransitions_start ?? this.timings.delayBetweenLetterTransitions)
                    - (Date.now() - lastTransitionStart)));

            var letter = this._letters[i];

            // set letter state to "starting" and animate
            letter.state = "starting";
            // hacks object stores some useful variables to be used inside the next animation finished function
            letter.hacks = { context: this, animID: animID };
            letter.snapObj.letter = letter;
            letter.snapObj.animate({ d: letter.paths.circle }, this.timings.letterToCircleTransition.ms, mina[this.timings.letterToCircleTransition.easing], function() {

                var letter = this.letter;
                var animID = this.letter.hacks.animID;
                var context = this.letter.hacks.context;

                if (animID !== context._animID || letter.state !== "starting") return;

                // set letter state to "playing"
                letter.state = "playing";

                // set easier path to animate for spinning
                this.attr("d", `M ${context._ogBoxContainer.cx - context.circleRadius},${context._ogBoxContainer.cy - context.circleDistance} a ${context.circleRadius},${
                    context.circleRadius} 0 1,0 ${context.circleRadius * 2},0 a ${context.circleRadius},${context.circleRadius} 0 1,0 ${-context.circleRadius * 2},0`);
            
                // if shrinking is enabled, spin and shrink, otherwise just spin
                if (context.options.circleShrinkRate !== 0)
                    context.animateCircleShrink(animID, letter);
                else
                    context.animateCircleSpin(animID, letter);

                // if all letters were animated, start spinning
                if (context._letters.overallState === "playing") {
                    context.animateContainerSpin(animID);
                }
            });
            
            lastTransitionStart = Date.now();
        }
    }*/

    // animates all circles (letters) spinning around container center without shrinking
    animateCircleSpin(animID, letter) {
        if (animID !== this._animID || letter.state !== "playing") return;

        letter.snapObj.transform(`r0,${this._ogBoxContainer.cx},${this._ogBoxContainer.cy}`);
        letter.snapObj.animate({ transform: `r360,${this._ogBoxContainer.cx},${this._ogBoxContainer.cy}` }, this.timings.letterCircleSpin.ms, mina[this.timings.letterCircleSpin.easing],
            () => this.animateCircleSpin(animID, letter));
    }

    // animates circles spin and shrink/grow
    animateCircleShrink(animID, letter, grow) {
        if (animID !== this._animID || letter.state !== "playing") return;
        
        if (grow) {
            var mult = 1 / mina[this.timings.letterCircleSpin.easing](0, 0.5, 1);

            letter.snapObj.attr({
                transform: `r0,${this._ogBoxContainer.cx},${this._ogBoxContainer.cy}s${1 - this.options.circleShrinkRate * mult},${
                    1 - this.options.circleShrinkRate * mult},${this._ogBoxContainer.cx},${this._ogBoxContainer.cy - this.circleDistance}`,
                shrinkValue: 1 - this.options.circleShrinkRate * mult
            });

            letter.snapObj.animate({
                transform: `r360,${this._ogBoxContainer.cx},${this._ogBoxContainer.cy}s1,1,${this._ogBoxContainer.cx},${
                    this._ogBoxContainer.cy - this.circleDistance}`,
                shrinkValue: 1
            }, this.timings.letterCircleSpin.ms / 2, (n) => mina[this.timings.letterCircleSpin.easing](n, 0.5, 1), () => this.animateCircleShrink(animID, letter, false));
        }
        else {
            letter.snapObj.attr({
                transform: `r0,${this._ogBoxContainer.cx},${this._ogBoxContainer.cy}s1,1,${this._ogBoxContainer.cx},${this._ogBoxContainer.cy - this.circleDistance}`,
                shrinkValue: 1
            });

            var mult = 1 / mina[this.timings.letterCircleSpin.easing](1, 0, 0.5);

            letter.snapObj.animate({
                transform: `r360,${this._ogBoxContainer.cx},${this._ogBoxContainer.cy}s${1 - this.options.circleShrinkRate * mult},${
                    1 - this.options.circleShrinkRate * mult},${this._ogBoxContainer.cx},${this._ogBoxContainer.cy - this.circleDistance}`,
                shrinkValue: 1 - this.options.circleShrinkRate * mult
            }, this.timings.letterCircleSpin.ms / 2, (n) => mina[this.timings.letterCircleSpin.easing](n, 0, 0.5), () => this.animateCircleShrink(animID, letter, true));
        }
    }

    // animate container spinning
    animateContainerSpin(animID) {
        if (animID !== this._animID || this._letters.overallState !== "playing") return;

        this._sContainer.transform(`r0,${this._ogBoxContainer.cx},${this._ogBoxContainer.cy}`);
        this._sContainer.animate({ transform: `r360,${this._ogBoxContainer.cx},${this._ogBoxContainer.cy}` }, this.timings.containerSpin.ms,
            mina[this.timings.containerSpin.easing], () => this.animateContainerSpin(animID));
    }

    // returns path of the circle to turn the letter into
    generateLetterToCircleAnimation(letter) {
        var new_paths = [];

        // separate connected paths
        var d = letter.node.getAttribute("d");
        var paths = d.split(/(?=M|m)/g).filter(i => i);

        // get the index of the outermost loop
        var outer_index = this.sortOuterLoops(paths);

        // calculate letter center
        var letterBBox = letter.getBBox();
        
        for (let i = 0; i < paths.length; i++) {

            // we only need the end points (discard control points and other parameters for curves and arcs etc)
            var segments = this.pathToEndPoints(paths[i]);

            if (i == outer_index) {

                // find point furthest away from enclosed circle
                var furthest = { index: -1, value: -1 };
                for (let j = 0; j < segments.length; j++) {
                    let distance = Math.abs(Math.sqrt(Math.pow(segments[j][0] - letterBBox.cx, 2) + Math.pow(segments[j][1] - letterBBox.cy, 2)) - this.circleRadius);
                    if (distance > furthest.value)
                        furthest = { index: j, value: distance };
                }

                // find angle of furthest point
                var furthest_angle = this.getDegreeAngle([letterBBox.cx, letterBBox.cy], segments[furthest.index], [letterBBox.cx, letterBBox.cy],
                    [letterBBox.cx + this.circleRadius, letterBBox.cy]);

                // check if clockwise or counter (< 0 or > 0)
                // https://stackoverflow.com/a/1165943/8414010
                var edge_sum = 0;
                for (let j = 0; j < segments.length; j++) {
                    let k = (j + 1) % segments.length;
                    edge_sum += (segments[k][0] - segments[j][0]) * (segments[k][1] + segments[j][1]);
                }
                var clockwise = edge_sum < 0;

                // generate circle path
                var path_circle = "";
                for (let j = 0; j < segments.length + 1; j++) {
                    let angle = (j - furthest.index) / segments.length * 2 * Math.PI * (clockwise ? 1 : -1) + furthest_angle + Math.PI;
                    if (j == 0) {
                        path_circle += `M ${Math.cos(angle) * this.circleRadius + this._ogBoxContainer.cx},${-Math.sin(angle) * this.circleRadius
                            + this._ogBoxContainer.cy - this.circleDistance}`;
                    }
                    else {
                        path_circle += `A ${this.circleRadius},${this.circleRadius} 0 1 ${clockwise ? 1 : 0} ${Math.cos(angle) 
                            * this.circleRadius + this._ogBoxContainer.cx},${-Math.sin(angle) * this.circleRadius + this._ogBoxContainer.cy - this.circleDistance}`;
                    }
                }

                new_paths[i] = path_circle;
            }
            else {
                // collapse all inner loops to the middle
                new_paths[i] = `M ${this._ogBoxContainer.cx},${this._ogBoxContainer.y - this.circleDistance - this.circleRadius}` + "h0".repeat(segments.length - 1);
            }
        }

        return new_paths.join(' ');
    }

    // takes an array of svg path strings and returns the index of the outermost loop
    sortOuterLoops(loops) {
        var temp_svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        var temp_path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        var temp_point = temp_svg.createSVGPoint();
        temp_svg.style.visibility = "hidden";
        temp_svg.append(temp_path);
        document.body.append(temp_svg);

        // try-finally is to make sure whatever the outcome is (a return or a throw) we remove the temp_svg
        try {

            // work with one loop as container at a time
            for (let i = 0; i < loops.length; i++) {
                temp_path.setAttribute("d", loops[i]);
                let j = 0;

                // for each loop, except the container, check if its first point is contained in the container loop
                for (; j < loops.length; j++) {
                    if (j == i) continue;

                    // get the first point of this loop
                    var path_points = Snap.parsePathString(loops[j]);
                    if (path_points.length == 0) {
                        throw "Invalid path data.";
                    }

                    [temp_point.x, temp_point.y] = this.getEndPointOfSegment(path_points[0]);

                    // we're looking for a loop that contains all other loops
                    if (!temp_path.isPointInFill(temp_point)) {
                        j = loops.length + 1; // this flag means this loop is not contained in at least one loop, this could be our guy
                    }
                }

                // if we reached the end of the for loop normally it means we found the outermost loop
                if (j == loops.length) {
                    return i;
                }
            }
            
            return 0;
        }
        finally {
            temp_svg.remove();
        }
    }

    // takes a segment in the form of a string or array and returns the actual final point of the command
    getEndPointOfSegment(segment) {
        if (!(segment instanceof Array))
            segment = Snap.path.toAbsolute(segment)[0];
        switch (segment[0]) {
            case 'H':
                return [parseInt(segment[1]), null];
            case 'V':
                return [null, parseInt(segment[1])];
            case 'Z': case 'z':
                return null;
            default:
                return [segment.at(-2), segment.at(-1)];
        }
    }

    // takes a path a string or array and returns an array of end points
    pathToEndPoints(path) {
        if (!(path instanceof Array))
            path = Snap.path.toAbsolute(path).filter(seg => seg.length > 1);
        var arr = [];
        for (let i = 0; i < path.length; i++) {
            var point = this.getEndPointOfSegment(path[i]);
            if (point) {
                if (path[i][0] === 'H' && arr.length > 0) point[1] = arr.at(-1)[1];
                if (path[i][0] === 'V' && arr.length > 0) point[0] = arr.at(-1)[0];
                arr.push(point);
            }
        }
        return arr;
    }

    // returns the angle in radians between two lines defined by two points each
    // https://stackoverflow.com/a/42159152/8414010
    getDegreeAngle(a1, a2, b1, b2) {
        var dAx = a2[0] - a1[0];
        var dAy = a1[1] - a2[1];
        var dBx = b2[0] - b1[0];
        var dBy = b1[1] - b2[1];
        return Math.atan2(dAx * dBy - dAy * dBx, dAx * dBx + dAy * dBy);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    drawDebugBox() {
        if (!this._debugBox)
            this._debugBox = this._sSvg.rect(this._ogBoxContainer.x, this._ogBoxContainer.y, this._ogBoxContainer.width, this._ogBoxContainer.height).attr({
                fill: "none",
                stroke: "#000",
                strokeWidth: 1
            });
    }

    deleteDebugBox() {
        this._debugBox?.remove();
        delete this._debugBox;
    }
}

Object.defineProperty(Object.prototype, 'deepFreeze', {
    value: function(obj) {
        const propNames = Object.getOwnPropertyNames(obj);

        for (const name of propNames) {
            const value = obj[name];

            if (value && typeof value === "object") {
                deepFreeze(value);
            }
        }

        return Object.freeze(obj);
    },
    enumerable: false
});

class Letters extends Array {

    // returns the overall state of the animation.
    // stopped: all letters ar at their initial position and not animated;
    // starting: one or more letters are in their letter-to-circle animation;
    // playing: all letters are in their spinning animation;
    // stopping: one or more letters are in their circle-to-letter animation. 
    get overallState() {
        var states = this.map(o => o.state);
        if (states.includes("starting")) return "starting";
        if (states.includes("stopping")) return "stopping";
        if (states.every(o => o === "stopped")) return "stopped";
        if (states.every(o => o === "playing")) return "playing";
    }

    // sets the same value, or pairs each value to each element if value is iteratable, to the property 'prop' of each element in the array.
    setProperty(prop, value) {
        if (!prop) return;
        if (value && typeof value !== "string" && typeof value[Symbol.iterator] === "function") {
            for (let i = 0; i < value.length; i++) {
                this[i] = this[i] || {};
                delete this[i][prop];
                this[i][prop] = value[i];
            }
        }
        else {
            for (let i = 0; i < this.length; i++) {
                delete this[i][prop];
                this[i][prop] = value;
            }
        }
    }
}