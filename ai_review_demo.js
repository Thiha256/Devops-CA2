// Throwaway sample file to demo the AI code reviewer on a pull request.
// Safe to delete / close the PR without merging.
function addNumbers(a, b) {
    var unusedTotal = 100;      // unused variable — AI should flag this
    return a + b                // missing semicolon
}

module.exports = addNumbers;
