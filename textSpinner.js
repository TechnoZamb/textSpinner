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
        letterCircleSpin: { ms: 1200, easing: 'easeInOutQuad' },
        containerSpin: { ms: 3000, easing: 'linear' }
    };

    _animPlaying = false; // flag saves animation state
    _nAnimated = 0;
    _letterPaths = [];
    _sSvg; _sContainer; _sLetters; // s stands for snap object
    _ogBoxContainer;
    _debugBox;
    _lastTransitionStart;

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
        await this.injectScripts();
        svg = $(svg);

        // load svg path letters
        var otFont = await opentype.load(this.options.fontFile); // ot stands for opentype object
        var otPaths = otFont.getPaths(this.options.text, 0, 0, this.options.fontSize);
        var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        svg.append(g);

        for (let otPath of otPaths) {
            g.append(otPath.toDOMElement(2));
        }
        
        this._sSvg = Snap(svg[0]);
        this._sContainer = Snap(g);

        var gBox = this._sContainer.getBBox();
        var svgBox = this._sSvg.node.getBoundingClientRect();
        this._ogBoxContainer = gBox;
        
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
        if (pathAttrs && pathAttrs.length != 0) {
            for (let path of this._sContainer.selectAll("path").items) {
                for (const [key, value] of pathAttrs) {
                    path.attr(key, value);
               }
            }
        }
        
        if (this.options?.drawDebugBox) this.drawDebugBox();
    }

    // injects the required scripts if not already included
    async injectScripts() {
        var requiredScripts = {
            jQuery: "https://code.jquery.com/jquery-3.6.0.min.js",
            Snap: "https://cdn.jsdelivr.net/npm/snapsvg@0.4.0/dist/snap.svg.min.js",
            opentype: "https://cdn.jsdelivr.net/npm/opentype.js@latest/dist/opentype.min.js",
            flatten: "https://gistcdn.githack.com/TechnoZamb/afdd1663f3a50d896812bfb2c9f8b975/raw/4d8cab3ab5e0dc32b8549df3c1812caca44f59ea/flatten.js",
            easings: "https://rawcdn.githack.com/overjase/snap-easing/3b6125b59c9409b199881887eebfeee4dd65bcf3/snap.svg.easing.js",
        };
        
        var script = document.createElement("script");
        var tot = 0, completed = 0;

        var loadScript = function (s) {
            script = document.createElement("script");
            script.src = s;
            script.type = "text/javascript";
            script.defer = "defer";
            script.onload = () => completed++;
            document.head.appendChild(script);
            tot++;
        };

        if (!window.jQuery) loadScript(requiredScripts.jQuery);
        if (window.Snap?.version !== '0.4.0') {
            delete window.Snap; loadScript(requiredScripts.Snap);
        }
        if (!window.opentype) loadScript(requiredScripts.opentype);
        if (!window.flatten) loadScript(requiredScripts.flatten);
        if (!window.mina?.easeInOutQuad) loadScript(requiredScripts.easings);

        while (completed !== tot) await this.sleep(200);
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
        if (this._animPlaying) return;
        this._animPlaying = true;

        this.animateLettersToCircles();
    }

    stopAnimation() {
        if (!this._animPlaying) return;
        this._animPlaying = false;

        this._sContainer.stop();
        flatten(this._sContainer.node);

        // refresh letters
        this._sLetters = this._sContainer.selectAll("path");

        // center position of one of the circles when at rotation = 0 (and container rotation = 0)
        var circleStartPos = [this._ogBoxContainer.cx, this._ogBoxContainer.cy - this.circleDistance - this.circleRadius];

        // sort circles from left to right
        var circles_lToR = [];
        for (let letter of this._sLetters.items) {
            
            letter.stop();
            var bbox = letter.node.getBBox();

            for (let i = 0; i < circles_lToR.length + 1; i++) {
                if (bbox.x < (circles_lToR[i]?.b.x ?? bbox.x + 1)) {
                    circles_lToR.splice(i, 0, { b: bbox, c: letter });
                    break;
                } 
            }
        }

        this._sContainer.node.innerHTML = ''; // remove all children

        // re-insert letters in new order
        for (let i = 0; i < circles_lToR.length; i++) {
            var circle = circles_lToR[i];
            this._sContainer.node.appendChild(circle.c.node);
            circle.c.attr({ d: this._letterPaths[i].circle, transform: `t${(circle.b.x + circle.b.width / 2) - circleStartPos[0]},${(circle.b.y + circle.b.height / 2) - circleStartPos[1]}` });
            circle = Snap(flatten(circle.c.node));	
            circle.animate({ d: this._letterPaths[i].original }, 300, mina.easeout);        }
    }

    // animates letters into circles animations
    async animateLettersToCircles() {
        this._sLetters = this._sContainer.selectAll("path");

        // when all letters have reached the center, start the container rotation
        this._nAnimated = 0; // keep track of how many letters have reached the center
        
        for (let letter of this._sLetters.items) {
            this._letterPaths.push({
                original: letter.node.getAttribute("d"),
                circle: this.generateLetterToCircleAnimation(letter)
            });
        }

        for (let i = 0; i < this._sLetters.items.length; i++) {
            this._sLetters[i].animate({ d: this._letterPaths[i].circle }, this.timings.letterToCircleTransition.ms, mina[this.timings.letterToCircleTransition.easing], () => {
                var letter = this._sLetters[this._nAnimated];
                letter.attr("d", `M ${this._ogBoxContainer.cx - this.circleRadius},${this._ogBoxContainer.cy - this.circleDistance} a ${this.circleRadius},${
                    this.circleRadius} 0 1,0 ${this.circleRadius * 2},0 a ${this.circleRadius},${this.circleRadius} 0 1,0 ${-this.circleRadius * 2},0`);
            
                if (this.options.circleShrinkRate !== 0)
                    this.animateCircleShrink(letter, this.splitTimingInTwo(this.timings.letterCircleSpin.ms, this.timings.letterCircleSpin.easing));
                else
                    this.animateCircleSpin(letter);

                if (this._nAnimated++ == this._sLetters.length - 1) {
                    this.animateContainerSpin();
                }
            });
            
            if (i !== 0)
                await this.sleep(Math.max(0, this.timings.delayBetweenLetterTransitions - (Date.now() - this._lastTransitionStart)));
            this._lastTransitionStart = Date.now();
        }
    }

    // animates all circles (letters) spinning around container center without shrinking
    animateCircleSpin(letter) {
        letter.transform(`r0,${this._ogBoxContainer.cx},${this._ogBoxContainer.cy}`);
        letter.animate({ transform: `r360,${this._ogBoxContainer.cx},${this._ogBoxContainer.cy}` }, this.timings.letterCircleSpin.ms, mina[this.timings.letterCircleSpin.easing],
            () => this.animateCircleSpin(letter));
    }

    // animates circles spin and shrink/grow
    animateCircleShrink(letter, timings) {
        var shrink = () => {
            letter.transform(`r0,${this._ogBoxContainer.cx},${this._ogBoxContainer.cy}`);
            letter.animate({ transform: `r180,${this._ogBoxContainer.cx},${this._ogBoxContainer.cy}s${1 - this.options.circleShrinkRate},${
                1 - this.options.circleShrinkRate},${this._ogBoxContainer.cx},${this._ogBoxContainer.cy - this.circleDistance}` },
                timings[0][0], mina[timings[0][1]], grow);
        }
        var grow = () => {
            letter.animate({ transform: `r360,${this._ogBoxContainer.cx},${this._ogBoxContainer.cy}s1,1,${this._ogBoxContainer.cx},${
                this._ogBoxContainer.cy - this.circleDistance}` }, timings[1][0], mina[timings[1][1]], shrink);
        }

        shrink();
    }

    // animate container spinning
    animateContainerSpin() {
        if (!this._animPlaying) return;

        this._sContainer.transform(`r0,${this._ogBoxContainer.cx},${this._ogBoxContainer.cy}`);
        this._sContainer.animate({ transform: `r360,${this._ogBoxContainer.cx},${this._ogBoxContainer.cy}` }, this.timings.containerSpin.ms, mina[this.timings.containerSpin.easing], () => this.animateContainerSpin());
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

    splitTimingInTwo(ms, easing) {
        if (this.options.circleShrinkRate !== 0 && easing.indexOf('InOut') === -1)
            throw "If 'circleShrinkRate' is != 0, 'timings.letterCircleSpin' must be an 'inOut' easing.";

        return [[ms / 2, easing.replace("InOut", "In")], [ms / 2, easing.replace("InOut", "Out")]];
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