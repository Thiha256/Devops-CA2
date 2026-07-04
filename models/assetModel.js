const db = require("../database");

// Fetch every physical laptop unit belonging to one model. Search/status
// filtering happens in the route, same as getModelsWithStats + the model search.
async function getAssetsByModel(modelId) {
    const [rows] = await db.execute(`
        SELECT laptop_id, asset_id, serial_no, status, maint_reason
        FROM laptop
        WHERE model_id = ?
        ORDER BY asset_id`,
        [modelId]
    );
    return rows;
}

module.exports = { getAssetsByModel };
