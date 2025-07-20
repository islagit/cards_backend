const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// PostgreSQL pool setup
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

// Инициализация базы данных
const createTables = async () => {
    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS sections (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT,
        position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS subsections (
        id SERIAL PRIMARY KEY,
        section_id INTEGER REFERENCES sections(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content TEXT,
        position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        subsection_id INTEGER REFERENCES subsections(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content TEXT,
        position INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    } catch (err) {
        console.error("Ошибка инициализации БД:", err);
    }
};

createTables();

// API: Получить все данные
app.get("/api/data", async (req, res) => {
    try {
        const { rows } = await pool.query(`
      SELECT 
        s.id as section_id, s.title as section_title, s.content as section_content, s.position as section_position,
        ss.id as subsection_id, ss.title as subsection_title, ss.content as subsection_content, ss.position as subsection_position,
        i.id as item_id, i.title as item_title, i.content as item_content, i.position as item_position
      FROM sections s
      LEFT JOIN subsections ss ON s.id = ss.section_id
      LEFT JOIN items i ON ss.id = i.subsection_id
      ORDER BY s.position, ss.position, i.position
    `);

        const sections = {};

        rows.forEach(row => {
            if (!sections[row.section_id]) {
                sections[row.section_id] = {
                    id: row.section_id,
                    title: row.section_title,
                    content: row.section_content,
                    position: row.section_position,
                    subsections: {}
                };
            }

            if (row.subsection_id && !sections[row.section_id].subsections[row.subsection_id]) {
                sections[row.section_id].subsections[row.subsection_id] = {
                    id: row.subsection_id,
                    title: row.subsection_title,
                    content: row.subsection_content,
                    position: row.subsection_position,
                    items: []
                };
            }

            if (row.item_id) {
                sections[row.section_id].subsections[row.subsection_id].items.push({
                    id: row.item_id,
                    title: row.item_title,
                    content: row.item_content,
                    position: row.item_position
                });
            }
        });

        const result = Object.values(sections).map(section => ({
            ...section,
            subsections: Object.values(section.subsections)
        }));

        res.json({ sections: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CRUD для секций
app.post("/api/sections", async (req, res) => {
    const { title, content } = req.body;
    try {
        const { rows: maxRows } = await pool.query("SELECT MAX(position) as max_pos FROM sections");
        const position = (maxRows[0].max_pos || 0) + 1;

        const { rows } = await pool.query(
            "INSERT INTO sections (title, content, position) VALUES ($1, $2, $3) RETURNING *",
            [title, content || "", position]
        );

        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put("/api/sections/:id", async (req, res) => {
    const { title, content } = req.body;
    const { id } = req.params;

    try {
        await pool.query(
            "UPDATE sections SET title = $1, content = $2 WHERE id = $3",
            [title, content || "", id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/sections/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM sections WHERE id = $1", [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CRUD для подразделов
app.post("/api/subsections", async (req, res) => {
    const { section_id, title, content } = req.body;
    try {
        const { rows: maxRows } = await pool.query("SELECT MAX(position) as max_pos FROM subsections WHERE section_id = $1", [section_id]);
        const position = (maxRows[0].max_pos || 0) + 1;

        const { rows } = await pool.query(
            "INSERT INTO subsections (section_id, title, content, position) VALUES ($1, $2, $3, $4) RETURNING *",
            [section_id, title, content || "", position]
        );

        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put("/api/subsections/:id", async (req, res) => {
    const { title, content } = req.body;
    const { id } = req.params;
    try {
        await pool.query(
            "UPDATE subsections SET title = $1, content = $2 WHERE id = $3",
            [title, content || "", id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/subsections/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM subsections WHERE id = $1", [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CRUD для элементов
app.post("/api/items", async (req, res) => {
    const { subsection_id, title, content } = req.body;
    try {
        const { rows: maxRows } = await pool.query("SELECT MAX(position) as max_pos FROM items WHERE subsection_id = $1", [subsection_id]);
        const position = (maxRows[0].max_pos || 0) + 1;

        const { rows } = await pool.query(
            "INSERT INTO items (subsection_id, title, content, position) VALUES ($1, $2, $3, $4) RETURNING *",
            [subsection_id, title, content || "", position]
        );

        res.json(rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put("/api/items/:id", async (req, res) => {
    const { title, content } = req.body;
    const { id } = req.params;
    try {
        await pool.query(
            "UPDATE items SET title = $1, content = $2 WHERE id = $3",
            [title, content || "", id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete("/api/items/:id", async (req, res) => {
    const { id } = req.params;
    try {
        await pool.query("DELETE FROM items WHERE id = $1", [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
