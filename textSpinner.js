const spinnerCircleRadius = 1.3;
const spinnerRadius = 100;

var setupRun = false;
var animPlaying = false;
var sSvg, sContainer, sLetters; // s stands for snap object
var ogBoxContainer;
var nAnimated = 0;
var letterPaths = [];

function setup(svg_id) {
    if (setupRun) return;
    if (!svg_id) throw 'Invalid svg ID.';

    sSvg = Snap("#" + svg_id);
    sContainer = sSvg.select("g");
    
    // bake all transforms
    flatten(sSvg.node);
    ogBoxContainer = sContainer.node.getBBox();
    
    setupRun = true;
}

function startAnimation(svg_id) {
    if (!setupRun && svg_id)
        setup(svg_id);

    if (animPlaying) return;
    animPlaying = true;

    animateLettersToCircles();
}

function stopAnimation() {
    if (!animPlaying) return;

    animPlaying = false;
    sContainer.stop();
    flatten(sContainer.node);

    // refresh letters
    sLetters = sContainer.selectAll("path");

    // center position of one of the circles when at rotation = 0 (and container rotation = 0)
    var circleStartPos = [ogBoxContainer.x + ogBoxContainer.width / 2, ogBoxContainer.y + spinnerCircleRadius];

    // sort circles from left to right
    var circles_lToR = [];
    for (let letter of sLetters.items) {
        
        letter.stop();
        var bbox = letter.node.getBBox();

        for (let i = 0; i < circles_lToR.length + 1; i++) {
            if (bbox.x < (circles_lToR[i]?.b.x ?? bbox.x + 1)) {
                circles_lToR.splice(i, 0, { b: bbox, c: letter });
                break;
            } 
        }
    }

    sContainer.node.innerHTML = ''; // remove all children

    for (let i = 0; i < circles_lToR.length; i++) {
        var circle = circles_lToR[i];
        sContainer.node.appendChild(circle.c.node);
        circle.c.attr({ d: letterPaths[i].circle, transform: `t${(circle.b.x + circle.b.width / 2) - circleStartPos[0]},${(circle.b.y + circle.b.height / 2) - circleStartPos[1]}` });
        circle = Snap(flatten(circle.c.node));
        circle.animate({ d: letterPaths[i].original }, 300, mina.easeout);
    }
}

// animates letters into circles animations
async function animateLettersToCircles() {
    sLetters = sContainer.selectAll("path");

    var boxContainer = sContainer.node.getBBox();
    var center = [boxContainer.width / 2 + boxContainer.x, boxContainer.height / 2 + boxContainer.y];

    // when all letters have reached the center, start the container rotation
    nAnimated = 0; // keep track of how many letters have reached the center
    for (let letter of sLetters.items) {
        letterPath = {
            original: letter.node.getAttribute("d"),
            circle: generateLetterToCircleAnimation(boxContainer, letter)
        };
        letterPaths.push(letterPath);

        letter.animate({ d: letterPath.circle }, 300, mina.easein, function() {
            letter.attr("d", `M ${center[0] - spinnerCircleRadius},${boxContainer.y + spinnerCircleRadius} a ${spinnerCircleRadius},${spinnerCircleRadius}
                 0 1,0 ${spinnerCircleRadius * 2},0 a ${spinnerCircleRadius},${spinnerCircleRadius} 0 1,0 ${-spinnerCircleRadius * 2},0`);
            animateCircleSpin(boxContainer, sLetters[nAnimated++]);
        });
            
        await sleep(50);
    }
}

// animates all circles (letters) spinning around container center
function animateCircleSpin(container, letter) {
    var center = [container.width / 2 + container.x, container.height / 2 + container.y];

    letter.transform(`r0,${center[0]},${center[1]}`);
    letter.animate({ transform: `r360,${center[0]},${center[1]}` }, 1200, mina.easeInOutQuad, f => animateCircleSpin(container, letter));
    //letter.animate({ transform: `s2,2,${center[0]},${center[1]}` }, 1000, mina.easeInOutQuad);

    if (nAnimated == sLetters.length) {
        nAnimated++;
        animateContainerSpin(container);
    }
}

// animate container spinning
function animateContainerSpin(container) {
    if (!animPlaying) return;

    var center = [container.width / 2 + container.x, container.height / 2 + container.y];

    sContainer.transform(`r0,${center[0]},${center[1]}`);
    sContainer.animate({ transform: `r360,${center[0]},${center[1]}` }, 3000, mina.linear, f => animateContainerSpin(container));
}

// returns path of the circle to turn the letter into
function generateLetterToCircleAnimation(container, letter) {
    var new_paths = [];

    // separate connected paths
    var d = letter.node.getAttribute("d");
    var paths = d.split(/(?=M|m)/g).filter(i => i);

    // get the index of the outermost loop
    var outer_index = sortOuterLoops(paths);

    // calculate container center
    var container_center = [container.width / 2 + container.x, container.height / 2 + container.y];
    
    // calculate letter center
    bBox = letter.node.getBBox();
    var letter_center = [bBox.width / 2 + bBox.x, bBox.height / 2 + bBox.y];
    
    for (let i = 0; i < paths.length; i++) {

        // we only need the end points (discard control points and other parameters for curves and arcs etc)
        var segments = pathToEndPoints(paths[i]);

        if (i == outer_index) {

            // find point furthest away from enclosed circle
            var furthest = { index: -1, value: -1 };
            for (let j = 0; j < segments.length; j++) {
                let distance = Math.abs(Math.sqrt(Math.pow(segments[j][0] - letter_center[0], 2) + Math.pow(segments[j][1] - letter_center[1], 2)) - spinnerCircleRadius);
                if (distance > furthest.value)
                    furthest = { index: j, value: distance };
            }

            // find angle of furthest point
            var furthest_angle = getDegreeAngle(letter_center, segments[furthest.index], letter_center, [letter_center[0] + spinnerCircleRadius, letter_center[1]]);

            // check if clockwise or counter (< 0 or > 0)
            // https://stackoverflow.com/a/1165943/8414010
            var edge_sum = 0;
            for (let j = 0; j < segments.length; j++) {
                let k = (j + 1) % segments.length;
                edge_sum += (segments[k][0] - segments[j][0]) * (segments[k][1] + segments[j][1]);
            }
            var clockwise = edge_sum < 0;
/*
            // generate circle path
            var path_circle = "";
            var prev_angle = 0;
            let j;
            for (j = 0; j < segments.length + 1; j++) {
                let angle = getDegreeAngle(letter_center, [letter_center[0] + spinnerCircleRadius, letter_center[1]], letter_center, segments[j % segments.length]);
                if (j == 0) {
                    path_circle += `M ${Math.cos(angle) * spinnerCircleRadius + letter_center[0]},${-Math.sin(angle) * spinnerCircleRadius + letter_center[1]}`;
                }
                else {
                    path_circle += `A ${spinnerCircleRadius},${spinnerCircleRadius} 0 ${(mod(angle - prev_angle, 2 * Math.PI) < Math.PI) ? 1 : 0} ${clockwise ? 1 : 0} ${Math.cos(angle) 
                        * spinnerCircleRadius + letter_center[0]},${-Math.sin(angle) * spinnerCircleRadius + letter_center[1]}`;
                }
                prev_angle = angle;
            }
            */
            
            // generate circle path
            var path_circle = "";
            for (let j = 0; j < segments.length; j++) {
                let angle = (j - furthest.index) / segments.length * 2 * Math.PI * (clockwise ? 1 : -1) + furthest_angle + Math.PI;
                if (j == 0) {
                    path_circle += `M ${Math.cos(angle) * spinnerCircleRadius + container_center[0]},${-Math.sin(angle) * spinnerCircleRadius + spinnerCircleRadius + container.y}`;
                }
                else {
                    path_circle += `A ${spinnerCircleRadius},${spinnerCircleRadius} 0 1 ${clockwise ? 1 : 0} ${Math.cos(angle) 
                        * spinnerCircleRadius + container_center[0]},${-Math.sin(angle) * spinnerCircleRadius + spinnerCircleRadius + container.y}`;
                }
            }
            let angle = -furthest.index / segments.length * 2 * Math.PI * (clockwise ? 1 : -1) + furthest_angle + Math.PI;
            path_circle += `A ${spinnerCircleRadius},${spinnerCircleRadius} 0 1 ${clockwise ? 1 : 0} ${Math.cos(angle) * spinnerCircleRadius
                + container_center[0]},${-Math.sin(angle) * spinnerCircleRadius + spinnerCircleRadius + container.y}`;

            new_paths[i] = path_circle;
        }
        else {
            // collapse all inner loops to the middle
            new_paths[i] = `M ${container_center[0]},${spinnerCircleRadius + container.y}` + "h0".repeat(segments.length - 1);
        }
    }

    return new_paths.join(' ');
}

// takes an array of svg path strings and returns the index of the outermost loop
function sortOuterLoops(loops) {
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
                first_point = loops[j].split(/[a-zA-Z]/g).filter(e => e)[0].split(/ |,/g).filter(e => e);
                if (first_point.length != 2) {
                    throw "Invalid path data.";
                }

                [temp_point.x, temp_point.y] = first_point;

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
function getEndPointOfSegment(segment) {
    if (!(segment instanceof Array))
        segment = segment.split(/ |,/g).filter(e => e);
    switch (segment[0]) {
        case 'H':
            return [parseInt(segment[1]), 0];
        case 'V':
            return [0, parseInt(segment[1])];
        case 'Z': case 'z':
            return null;
        default:
            return [segment.at(-2), segment.at(-1)];
    }
}

// normalizes a path in the form of a string or array
function pathToEndPoints(path) {
    if (!(path instanceof Array))
        path = Snap.path.toAbsolute(path).filter(seg => seg.length > 1);
    let arr = [];
    for (let i = 0; i < path.length; i++) {
        point = getEndPointOfSegment(path[i]);
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
function getDegreeAngle(a1, a2, b1, b2) {
    var dAx = a2[0] - a1[0];
    var dAy = a1[1] - a2[1];
    var dBx = b2[0] - b1[0];
    var dBy = b1[1] - b2[1];
    return Math.atan2(dAx * dBy - dAy * dBx, dAx * dBx + dAy * dBy);
}

// modulo
function mod(n, m) {
    return ((n % m) + m) % m;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
