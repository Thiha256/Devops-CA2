const db = require("../database");

// Fetch every laptop model with asset counts aggregated from the `laptop` table,
// shaped to match what adminPage.ejs expects (id, name, specs, totalAssets, ...).
async function getModelsWithStats() {
    const [rows] = await db.execute(`
        SELECT
            lm.model_id AS id,
            CONCAT(lm.brand, ' ', lm.model_name) AS name,
            CONCAT(lm.cpu, ', ', lm.ram, 'GB RAM, ', lm.storage, 'GB SSD') AS specs,
            lm.image_url,
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

// Same shape as getModelsWithStats, scoped to one model — used for the
// asset manager page header.
async function getModelStatsById(id) {
    const [rows] = await db.execute(`
        SELECT
            lm.model_id AS id,
            CONCAT(lm.brand, ' ', lm.model_name) AS name,
            CONCAT(lm.cpu, ', ', lm.ram, 'GB RAM, ', lm.storage, 'GB SSD') AS specs,
            lm.image_url,
            COUNT(l.laptop_id) AS totalAssets,
            SUM(l.status = 'available') AS availableAssets,
            SUM(l.status = 'on loan') AS loanedAssets,
            SUM(l.status = 'maintenance') AS maintenanceAssets
        FROM laptop_model lm
        LEFT JOIN laptop l ON l.model_id = lm.model_id
        WHERE lm.model_id = ?
        GROUP BY lm.model_id`,
        [id]
    );
    return rows[0] || null;
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

async function updateModel(modelId, brand, model_name, cpu, ram, storage, graphics_type, image_url) {
    await db.execute(`
        UPDATE laptop_model
        SET brand = ?, model_name = ?, cpu = ?, ram = ?, storage = ?, graphics_type = ?, image_url = ?
        WHERE model_id = ?`,
        [brand, model_name, cpu, ram, storage, graphics_type, image_url, modelId]
    );
}

async function createModel(brand, model_name, cpu, ram, storage, graphics_type, image_url) {
    const [result] = await db.execute(`
        INSERT INTO laptop_model (brand, model_name, cpu, ram, storage, graphics_type, image_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [brand, model_name, cpu, ram, storage, graphics_type, image_url]
    );
    return result.insertId;
}

// >>> Implemented by: Lin Htut Win — low-stock inventory alert query <<<
// Returns every laptop model whose number of 'available' units is at or below
// `threshold`, so the scheduled n8n workflow can email an admin to restock.
// COALESCE(...,0) makes a model with zero units count as 0 available (not NULL),
// so brand-new / fully-loaned-out models are correctly flagged as low stock.
async function getLowStockModels(threshold) {
    const [rows] = await db.execute(`
        SELECT
            lm.model_id AS id,
            CONCAT(lm.brand, ' ', lm.model_name) AS name,
            COUNT(l.laptop_id) AS totalAssets,
            COALESCE(SUM(l.status = 'available'), 0) AS available
        FROM laptop_model lm
        LEFT JOIN laptop l ON l.model_id = lm.model_id
        GROUP BY lm.model_id
        HAVING available <= ?
        ORDER BY available ASC, name ASC`,
        [threshold]
    );
    return rows;
}

module.exports = { getModelsWithStats, getModelStatsById, deleteModel, getModelById, updateModel, createModel, getLowStockModels };
