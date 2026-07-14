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

// Create a physical asset. Status defaults to 'available' but the admin can set
// it on creation (e.g. straight to maintenance). maint_reason is only kept when
// the status is 'maintenance', mirroring updateAsset.
async function createAsset(modelId, asset_id, serial_no, status, maint_reason) {
    await db.execute(`
        INSERT INTO laptop (model_id, asset_id, serial_no, status, maint_reason)
        VALUES (?, ?, ?, ?, ?)`,
        [modelId, asset_id, serial_no, status || 'available', status === 'maintenance' ? maint_reason : null]
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
