// This code was copied from https://github.com/mochajs/mocha but modified to allow spec output at the same time
// as the file and to be in the junit format that we use in AZDO

// Note: Even when running in parallel, the output logger is sync'd. It runs in the root mocha process and not
// in the same process as the tests.
'use strict';
/**
 * @module JUnit
 */
/**
 * Module dependencies.
 */

var Base = require('mocha/lib/reporters/base');
var utils = require('mocha/lib/utils');
var fs = require('fs');
var path = require('path');
var errors = require('mocha/lib/errors');
const { clear } = require('winston');
var createUnsupportedError = errors.createUnsupportedError;
var constants = require('mocha/lib/runner').constants;
var EVENT_TEST_PASS = constants.EVENT_TEST_PASS;
var EVENT_TEST_FAIL = constants.EVENT_TEST_FAIL;
var EVENT_RUN_END = constants.EVENT_RUN_END;
var EVENT_TEST_PENDING = constants.EVENT_TEST_PENDING;
var EVENT_RUN_BEGIN = constants.EVENT_RUN_BEGIN;
var EVENT_SUITE_BEGIN = constants.EVENT_SUITE_BEGIN;
var EVENT_SUITE_END = constants.EVENT_SUITE_END;
var STATE_FAILED = require('mocha/lib/runnable').constants.STATE_FAILED;
var inherits = utils.inherits;
var escape = utils.escape;
var color = Base.color;

/**
 * Save timer references to avoid Sinon interfering (see GH-237).
 */
var Date = global.Date;

/**
 * Expose `JUnit`.
 */

exports = module.exports = JUnit;

/**
 * Constructs a new `JUnit` reporter instance.
 *
 * @public
 * @class
 * @memberof Mocha.reporters
 * @extends Mocha.reporters.Base
 * @param {Runner} runner - Instance triggers reporter actions.
 * @param {Object} [options] - runner options
 */
function JUnit(runner, options) {
    Base.call(this, runner, options);

    // Save root suite for output later
    this.rootSuite = runner.suite;

    var tests = [];
    var suites = [];
    var self = this;
    var indents = 0;
    var n = 0;

    function indent() {
        return Array(indents).join('  ');
    }

    // the default name of the test suite if none is provided
    this.suiteName = 'Mocha Tests';

    let outputPath = process.env.MOCHA_FILE;
    if (options && options.reporterOptions) {
        if (options.reporterOptions.output && !outputPath) {
            outputPath = options.reporterOptions.output;
        }
        // get the suite name from the reporter options (if provided)
        this.suiteName = options.reporterOptions.suiteName;
    }
    if (outputPath) {
        if (!fs.createWriteStream) {
            throw createUnsupportedError('file output not supported in browser');
        }

        fs.mkdirSync(path.dirname(outputPath), {
            recursive: true
        });
        self.fileStream = fs.createWriteStream(outputPath);
    }

    runner.on(EVENT_TEST_PENDING, function (test) {
        tests.push(test);
        var fmt = indent() + color('pending', '  - %s');
        Base.consoleLog(fmt, test.title);
    });

    runner.on(EVENT_TEST_PASS, function (test) {
        tests.push(test);
        var fmt;
        if (test.speed === 'fast') {
            fmt = indent() + color('checkmark', '  ' + Base.symbols.ok) + color('pass', ' %s');
            Base.consoleLog(fmt, test.title);
        } else {
            fmt =
                indent() +
                color('checkmark', '  ' + Base.symbols.ok) +
                color('pass', ' %s') +
                color(test.speed, ' (%dms)');
            Base.consoleLog(fmt, test.title, test.duration);
        }
    });

    runner.on(EVENT_TEST_FAIL, function (test) {
        tests.push(test);
        Base.consoleLog(indent() + color('fail', '  %d) %s'), ++n, test.title);
    });

    runner.once(EVENT_RUN_END, function () {
        self.outputXml(suites, tests);

        // Print out the spec output
        self.epilogue();
    });

    runner.on(EVENT_RUN_BEGIN, function () {
        Base.consoleLog();
    });

    runner.on(EVENT_SUITE_BEGIN, function (suite) {
        suites.push(suite);
        ++indents;
        Base.consoleLog(color('suite', '%s%s'), indent(), suite.title);
    });

    runner.on(EVENT_SUITE_END, function () {
        --indents;
        if (indents === 1) {
            Base.consoleLog();
        }
    });
}

/**
 * Inherit from `Base.prototype`.
 */
inherits(JUnit, Base);

/**
 * Override done to close the stream (if it's a file).
 *
 * @param failures
 * @param {Function} fn
 */
JUnit.prototype.done = function (failures, fn) {
    if (this.fileStream) {
        this.fileStream.end(function () {
            fn(failures);
        });
    } else {
        fn(failures);
    }
};

/**
 * Write out the given line.
 *
 * @param {string} line
 */
JUnit.prototype.write = function (line) {
    if (this.fileStream) {
        this.fileStream.write(line + '\n');
    } else if (typeof process === 'object' && process.stdout) {
        process.stdout.write(line + '\n');
    } else {
        Base.consoleLog(line);
    }
};

JUnit.prototype.outputXml = function (suites, tests) {
    // Turn off colorization. This makes unicode characters that can't be read by
    // JUnit parsers
    Base.useColors = false;

    // Write the starting tag for the root
    this.write(
        tag(
            'testsuite',
            {
                name: this.suiteName,
                tests: this.stats.tests,
                failures: 0,
                errors: this.stats.failures,
                skipped: this.stats.tests - this.stats.failures - this.stats.passes,
                timestamp: new Date().toUTCString(),
                time: this.stats.duration / 1000 || 0
            },
            false
        )
    );

    // Clear all of the tests and suites all the way down on the root
    // We want to just have the ones that actually ran
    var clearTestsAndSuites = (suite) => {
        suite.tests = [];
        suite.suites.forEach(clearTestsAndSuites);
        suite.suites = [];
        suite.duration = 0;
        suite.failures = 0;
    };
    clearTestsAndSuites(this.rootSuite);
    this.rootSuite.tests = [...tests];

    Base.consoleLog(JSON.stringify(tests));
    Base.consoleLog(JSON.stringify(suites));

    // Collect the suites that actually ran up to the root
    tests.forEach((t) => {
        // Modify the parents of the test to just be the ones we ran and
        // add appropriate data to compute our xml later
        var parent = t.parent;
        while (parent) {
            var grandParent = parent.parent;

            // In parallel mode tests are not created in the root
            if (!parent.tests) {
                parent.tests = [];
            }
            parent.tests.push(t);
            parent.duration += t.duration;
            parent.failures += t.state === STATE_FAILED ? 1 : 0;

            // In parallel mode suites are not created in the root.
            if (grandParent && !grandParent.suites) {
                grandParent.suites = [];
            }
            if (grandParent && !grandParent.suites.find((p) => p == parent)) {
                grandParent.suites.push(parent);
            }
            parent = grandParent;
        }
    });

    // Recurse through sub suites and tests
    if (this.rootSuite.suites && this.rootSuite.suites.length) {
        this.rootSuite.suites.forEach(this.outputSuite.bind(this));
    } else if (this.rootSuite.tests && this.rootSuite.tests.length) {
        this.rootSuite.tests.forEach(this.outputTest.bind(this));
    }

    this.write('</testsuite>');

    Base.useColors = true;
};

JUnit.prototype.outputSuite = function (suite) {
    // Write tag for the suite
    this.write(
        tag(
            'testsuite',
            {
                name: suite.title,
                tests: suite.tests.length,
                failures: suite.failures,
                timestamp: new Date().toUTCString(),
                time: suite.duration / 1000 || 0
            },
            false
        )
    );

    // Recurse through sub suites and tests
    if (suite.suites && suite.suites.length) {
        suite.suites.forEach(this.outputSuite.bind(this));
    } else if (suite.tests && suite.tests.length) {
        suite.tests.forEach(this.outputTest.bind(this));
    }

    this.write('</testsuite>');
};

JUnit.prototype.outputTest = function (test) {
    // Write tag for the test case
    this.write(
        tag(
            'testcase',
            {
                name: test.fullTitle(),
                classname: test.title,
                time: test.duration / 1000 || 0
            },
            false
        )
    );

    if (test.state === STATE_FAILED) {
        var err = test.err;
        var diff = !Base.hideDiff && Base.showDiff(err) ? '\n' + Base.generateDiff(err.actual, err.expected) : '';

        this.write(
            tag(
                'failure',
                {
                    message: escape(err.message),
                    type: err.type
                },
                false
            )
        );
        this.write(`<![CDATA[${err.message}\n${diff}\n${err.stack}]]>`);
        this.write('</failure>');
    }

    this.write('</testcase>');
};

/**
 * HTML tag helper.
 *
 * @param name
 * @param attrs
 * @param close
 * @param content
 * @return {string}
 */
function tag(name, attrs, close, content) {
    var end = close ? '/>' : '>';
    var pairs = [];
    var tag;

    for (var key in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, key)) {
            pairs.push(key + '="' + escape(attrs[key]) + '"');
        }
    }

    tag = '<' + name + (pairs.length ? ' ' + pairs.join(' ') : '') + end;
    if (content) {
        tag += content + '</' + name + end;
    }
    return tag;
}

JUnit.description = 'JUnit-compatible XML output';
