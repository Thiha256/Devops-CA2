const db = require("../database");

// Fetch every laptop model with asset counts aggregated from the `laptop` table,
// shaped to match what adminPage.ejs expects (id, name, specs, totalAssets, ...).
async function getModelsWithStats() {
    const [rows] = await db.execute(`
        SELECT
            lm.model_id AS id,
            CONCAT(lm.brand, ' ', lm.model_name) AS name,
            CONCAT(lm.cpu, ', ', lm.ram, 'GB RAM, ', lm.storage, 'GB SSD') AS specs,
            COUNT(l.laptop_id) AS totalAssets,
            SUM(l.status = 'available') AS availableAssets,
            SUM(l.status = 'on loan') AS loanedAssets,
            SUM(l.status = 'maintenance') AS maintenanceAssets
        FROM laptop_model lm
        LEFT JOIN laptop l ON l.model_id = lm.model_id
        GROUP BY lm.model_id
        ORDER BY lm.brand, lm.model_name`
    );
    return rows;
}

// Delete a model. Throws (mysql error code ER_ROW_IS_REFERENCED_2) if any
// laptop, school assignment, or loan request still references it.
async function deleteModel(id) {
    await db.execute(`DELETE FROM laptop_model WHERE model_id = ?`, [id]);
}

// Fetch the raw, editable fields for one model (used to pre-fill the edit form).
async function getModelById(modelId) {
    const [rows] = await db.execute(`
        SELECT model_id AS id, brand, model_name, cpu, ram, storage, graphics_type, image_url
        FROM laptop_model
        WHERE model_id = ?`,
        [modelId]
    );
    return rows[0] || null;
}

async function updateModel(modelId, { brand, model_name, cpu, ram, storage, graphics_type, image_url }) {
    await db.execute(`
        UPDATE laptop_model
        SET brand = ?, model_name = ?, cpu = ?, ram = ?, storage = ?, graphics_type = ?, image_url = ?
        WHERE model_id = ?`,
        [brand, model_name, cpu, ram, storage, graphics_type, image_url, modelId]
    );
}

module.exports = { getModelsWithStats, deleteModel, getModelById, updateModel };
