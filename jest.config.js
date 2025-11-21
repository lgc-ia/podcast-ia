module.exports = {
    testEnvironment: 'jsdom',
    coverageDirectory: 'coverage',
    collectCoverageFrom: [
        'js/**/*.js',
        '!js/**/*.test.js'
    ],
    testMatch: [
        '**/__tests__/**/*.js',
        '**/?(*.)+(spec|test).js'
    ],
    transform: {
        '^.+\\.js$': 'babel-jest'
    }
};
