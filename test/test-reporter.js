/**
 * Digital Health Pass 
 *
 * (c) Copyright Merative US L.P. and others 2020-2022 
 *
 * SPDX-Licence-Identifier: Apache 2.0
 */

const mocha = require('mocha');
const path = require('path');
const fs = require('fs');

// eslint-disable-next-line complexity
const tag = (name, attrs, close, content) => {
    const end = close ? '/>' : '>';
    const pairs = [];
    Object.keys(attrs).forEach((key) => {
        pairs.push(`${key}="${attrs[key]}"`);
    });
    let tag = `<${name}${pairs.length ? ` ${pairs.join(' ')}` : ''}${end}`;
    if (content) {
        tag += `${content}</${name}${end}`;
    }
    return tag;
};

function TestReporter(runner, options) {
    mocha.reporters.Base.call(this, runner, options);

    const { stats } = this;
    const tests = [];
    let numErrors = 0;

    fs.mkdirSync(path.dirname(options.reporterOptions.output), {
        recursive: true,
    });
    this.fileStream = fs.createWriteStream(options.reporterOptions.output);

    runner.on('pass', (test) => {
        tests.push(test);
    });

    runner.on('fail', (test, err) => {
        tests.push(test);
        if (err) {
            numErrors += 1;
        }
    });

    runner.on('pending', (test) => {
        tests.push(test);
    });

    runner.once('end', () => {
        this.fileStream = fs.createWriteStream(options.reporterOptions.output);
        this.write(
            tag(
                'testsuite',
                {
                    name: 'Mocha Tests',
                    tests: stats.tests,
                    failures: stats.failures,
                    errors: numErrors,
                    skipped: stats.pending,
                    timestamp: new Date().toUTCString(),
                    time: stats.duration / 1000 || 0,
                },
                false
            ),
            this.fileStream
        );
        tests.forEach((t) => {
            this.write(
                tag(
                    'testcase',
                    {
                        classname: t.parent.fullTitle(),
                        name: t.title,
                        time: t.duration / 1000 || 0,
                    },
                    true
                ),
                this.fileStream
            );
        });
        this.write('</testsuite>', this.fileStream);
    });
}

TestReporter.prototype.write = (line, fileStream) => {
    if (fileStream) {
        fileStream.write(`${line}\n`);
    } else if (typeof process === 'object' && process.stdout) {
        process.stdout.write(`${line}\n`);
    } else {
        mocha.reporters.Base.consoleLog(line);
    }
};

// Can't use arrow functions because of lack of binding to this
TestReporter.prototype.done = function done(failures, fn) {
    if (this.fileStream) {
        this.fileStream.end(() => {
            fn(failures);
        });
    } else {
        fn(failures);
    }
};

module.exports = TestReporter;
