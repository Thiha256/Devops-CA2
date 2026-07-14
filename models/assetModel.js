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

// New assets always start out available; maintenance/on loan only happen later.
async function createAsset(modelId, asset_id, serial_no) {
    await db.execute(`
        INSERT INTO laptop (model_id, asset_id, serial_no, status)
        VALUES (?, ?, ?, 'available')`,
        [modelId, asset_id, serial_no]
    );
}

async function getAssetById(laptopId) {
    const [rows] = await db.execute(`
        SELECT laptop_id, model_id, asset_id, serial_no, status, maint_reason
        FROM laptop
        WHERE laptop_id = ?`,
        [laptopId]
    );
    return rows[0];
}

async function updateAsset(laptopId, asset_id, serial_no, status, maint_reason) {
    await db.execute(`
        UPDATE laptop
        SET asset_id = ?, serial_no = ?, status = ?, maint_reason = ?
        WHERE laptop_id = ?`,
        [asset_id, serial_no, status, status === 'maintenance' ? maint_reason : null, laptopId]
    );
}

// Throws (mysql error code ER_ROW_IS_REFERENCED_2) if any loan still references it.
async function deleteAsset(laptopId) {
    await db.execute(`DELETE FROM laptop WHERE laptop_id = ?`, [laptopId]);
}

module.exports = { getAssetsByModel, createAsset, getAssetById, updateAsset, deleteAsset };
