// Demo file to test the AI code reviewer on a pull request.
// Safe to close/delete after the review shows up.
function addNumbers(a, b) {
    var unusedTotal = 100;      // unused variable
    return a + b                // missing semicolon
}

module.exports = addNumbers;
