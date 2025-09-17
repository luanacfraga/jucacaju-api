const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configuração do banco PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

// Criar tabelas
const createTables = async () => {
  try {
    // Tabela de receitas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS recipes (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        meal_type TEXT NOT NULL,
        ingredients TEXT NOT NULL,
        instructions TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabela de despensa
    await pool.query(`
      CREATE TABLE IF NOT EXISTS pantry (
        id SERIAL PRIMARY KEY,
        ingredient TEXT NOT NULL UNIQUE,
        has_item BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log("✅ Tabelas criadas/verificadas com sucesso!");
  } catch (error) {
    console.error("❌ Erro ao criar tabelas:", error);
  }
};

// Inicializar tabelas
createTables();

// Rotas para receitas
app.get("/api/recipes", async (req, res) => {
  try {
    const { meal_type } = req.query;
    let query = "SELECT * FROM recipes";
    let params = [];

    if (meal_type) {
      query += " WHERE meal_type = $1";
      params.push(meal_type);
    }

    query += " ORDER BY created_at DESC";

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error("Erro ao buscar receitas:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/recipes", async (req, res) => {
  try {
    const { name, meal_type, ingredients, instructions } = req.body;

    if (!name || !meal_type || !ingredients) {
      res.status(400).json({
        error: "Nome, tipo de refeição e ingredientes são obrigatórios",
      });
      return;
    }

    const query =
      "INSERT INTO recipes (name, meal_type, ingredients, instructions) VALUES ($1, $2, $3, $4) RETURNING id";

    const result = await pool.query(query, [
      name,
      meal_type,
      ingredients,
      instructions,
    ]);
    res.json({ id: result.rows[0].id, message: "Receita criada com sucesso!" });
  } catch (error) {
    console.error("Erro ao criar receita:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/recipes/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { name, meal_type, ingredients, instructions } = req.body;

    const query =
      "UPDATE recipes SET name = $1, meal_type = $2, ingredients = $3, instructions = $4 WHERE id = $5";

    const result = await pool.query(query, [
      name,
      meal_type,
      ingredients,
      instructions,
      id,
    ]);

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Receita não encontrada" });
      return;
    }

    res.json({ message: "Receita atualizada com sucesso!" });
  } catch (error) {
    console.error("Erro ao atualizar receita:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/recipes/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query("DELETE FROM recipes WHERE id = $1", [id]);

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Receita não encontrada" });
      return;
    }

    res.json({ message: "Receita deletada com sucesso!" });
  } catch (error) {
    console.error("Erro ao deletar receita:", error);
    res.status(500).json({ error: error.message });
  }
});

// Rotas para despensa
app.get("/api/pantry", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM pantry ORDER BY ingredient");
    res.json(result.rows);
  } catch (error) {
    console.error("Erro ao buscar despensa:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/pantry", async (req, res) => {
  try {
    const { ingredient, has_item } = req.body;

    if (!ingredient) {
      res.status(400).json({ error: "Ingrediente é obrigatório" });
      return;
    }

    const query =
      "INSERT INTO pantry (ingredient, has_item) VALUES ($1, $2) ON CONFLICT (ingredient) DO UPDATE SET has_item = $2";

    await pool.query(query, [ingredient, has_item]);
    res.json({ message: "Item da despensa atualizado com sucesso!" });
  } catch (error) {
    console.error("Erro ao adicionar item:", error);
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/pantry/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { has_item } = req.body;

    const result = await pool.query(
      "UPDATE pantry SET has_item = $1 WHERE id = $2",
      [has_item, id]
    );

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Item não encontrado" });
      return;
    }

    res.json({ message: "Status atualizado com sucesso!" });
  } catch (error) {
    console.error("Erro ao atualizar item:", error);
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/pantry/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query("DELETE FROM pantry WHERE id = $1", [id]);

    if (result.rowCount === 0) {
      res.status(404).json({ error: "Item não encontrado" });
      return;
    }

    res.json({ message: "Item deletado com sucesso!" });
  } catch (error) {
    console.error("Erro ao deletar item:", error);
    res.status(500).json({ error: error.message });
  }
});

// Rota para lista de compras (itens que acabaram)
app.get("/api/shopping-list", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM pantry WHERE has_item = false ORDER BY ingredient"
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Erro ao buscar lista de compras:", error);
    res.status(500).json({ error: error.message });
  }
});

// Inserir dados iniciais
const insertSampleData = async () => {
  try {
    // Verificar se já existem receitas
    const recipesCheck = await pool.query("SELECT COUNT(*) FROM recipes");
    if (recipesCheck.rows[0].count > 0) return;

    // Receitas de exemplo
    const sampleRecipes = [
      {
        name: "Omelete Simples",
        meal_type: "cafe",
        ingredients: "2 ovos, sal, queijo ralado, manteiga",
        instructions:
          "Bata os ovos com sal. Aqueça a manteiga na frigideira. Despeje os ovos e adicione o queijo. Dobre ao meio quando estiver firme.",
      },
      {
        name: "Arroz com Feijão",
        meal_type: "almoco",
        ingredients: "1 xícara de arroz, 1 lata de feijão, alho, cebola, óleo",
        instructions:
          "Refogue alho e cebola no óleo. Adicione o arroz e deixe dourar. Adicione água e cozinhe. Sirva com feijão.",
      },
      {
        name: "Salada Verde",
        meal_type: "jantar",
        ingredients: "Alface, tomate, cebola, azeite, vinagre, sal",
        instructions:
          "Lave e corte os vegetais. Misture com azeite, vinagre e sal a gosto.",
      },
    ];

    for (const recipe of sampleRecipes) {
      await pool.query(
        "INSERT INTO recipes (name, meal_type, ingredients, instructions) VALUES ($1, $2, $3, $4)",
        [recipe.name, recipe.meal_type, recipe.ingredients, recipe.instructions]
      );
    }

    // Ingredientes de exemplo para despensa
    const sampleIngredients = [
      "arroz",
      "feijão",
      "ovos",
      "leite",
      "pão",
      "queijo",
      "manteiga",
      "alho",
      "cebola",
      "tomate",
      "alface",
      "óleo",
      "sal",
    ];

    for (const ingredient of sampleIngredients) {
      await pool.query(
        "INSERT INTO pantry (ingredient, has_item) VALUES ($1, true) ON CONFLICT (ingredient) DO NOTHING",
        [ingredient]
      );
    }

    console.log("✅ Dados de exemplo inseridos com sucesso!");
  } catch (error) {
    console.error("❌ Erro ao inserir dados de exemplo:", error);
  }
};

// Inserir dados de exemplo
insertSampleData();

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📱 Acesse: http://localhost:${PORT}`);
});

// Fechar conexão com banco ao encerrar o servidor
process.on("SIGINT", async () => {
  await pool.end();
  console.log("🔒 Conexão com banco de dados fechada.");
  process.exit(0);
});
