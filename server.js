const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Inicializar banco de dados SQLite
const dbPath = path.join(__dirname, "jucacaju.db");
const db = new sqlite3.Database(dbPath);

// Criar tabelas
db.serialize(() => {
  // Tabela de receitas
  db.run(`CREATE TABLE IF NOT EXISTS recipes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    meal_type TEXT NOT NULL,
    ingredients TEXT NOT NULL,
    instructions TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Tabela de despensa
  db.run(`CREATE TABLE IF NOT EXISTS pantry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient TEXT NOT NULL UNIQUE,
    has_item BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

// Rotas para receitas
app.get("/api/recipes", (req, res) => {
  const { meal_type } = req.query;
  let query = "SELECT * FROM recipes";
  let params = [];

  if (meal_type) {
    query += " WHERE meal_type = ?";
    params.push(meal_type);
  }

  query += " ORDER BY created_at DESC";

  db.all(query, params, (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post("/api/recipes", (req, res) => {
  const { name, meal_type, ingredients, instructions } = req.body;

  if (!name || !meal_type || !ingredients) {
    res.status(400).json({
      error: "Nome, tipo de refeição e ingredientes são obrigatórios",
    });
    return;
  }

  const query =
    "INSERT INTO recipes (name, meal_type, ingredients, instructions) VALUES (?, ?, ?, ?)";

  db.run(query, [name, meal_type, ingredients, instructions], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ id: this.lastID, message: "Receita criada com sucesso!" });
  });
});

// Rota para processar ingredientes de uma receita
app.post("/api/recipes/:id/process-ingredients", (req, res) => {
  const { id } = req.params;
  const { ingredients } = req.body;

  if (!ingredients) {
    res.status(400).json({ error: "Lista de ingredientes é obrigatória" });
    return;
  }

  // Parse dos ingredientes (separar por vírgula e limpar espaços)
  const ingredientList = ingredients
    .split(",")
    .map((ingredient) => ingredient.trim().toLowerCase())
    .filter((ingredient) => ingredient.length > 0);

  let processedCount = 0;
  let addedToShoppingList = 0;

  // Processar cada ingrediente
  const processIngredient = (ingredient, callback) => {
    // Verificar se o ingrediente já existe na despensa
    db.get(
      "SELECT * FROM pantry WHERE ingredient = ?",
      [ingredient],
      (err, row) => {
        if (err) {
          callback(err);
          return;
        }

        if (row) {
          // Ingrediente já existe, apenas incrementar contador
          processedCount++;
          callback(null);
        } else {
          // Ingrediente não existe, criar na despensa como "não disponível" (has_item = 0)
          db.run(
            "INSERT INTO pantry (ingredient, has_item) VALUES (?, 0)",
            [ingredient],
            function (err) {
              if (err) {
                callback(err);
                return;
              }
              processedCount++;
              addedToShoppingList++;
              callback(null);
            }
          );
        }
      }
    );
  };

  // Processar todos os ingredientes sequencialmente
  let index = 0;
  const processNext = () => {
    if (index >= ingredientList.length) {
      res.json({
        message: `Processados ${processedCount} ingredientes`,
        addedToShoppingList: addedToShoppingList,
        ingredients: ingredientList,
      });
      return;
    }

    processIngredient(ingredientList[index], (err) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      index++;
      processNext();
    });
  };

  processNext();
});

app.put("/api/recipes/:id", (req, res) => {
  const { id } = req.params;
  const { name, meal_type, ingredients, instructions } = req.body;

  const query =
    "UPDATE recipes SET name = ?, meal_type = ?, ingredients = ?, instructions = ? WHERE id = ?";

  db.run(
    query,
    [name, meal_type, ingredients, instructions, id],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: "Receita não encontrada" });
        return;
      }
      res.json({ message: "Receita atualizada com sucesso!" });
    }
  );
});

app.delete("/api/recipes/:id", (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM recipes WHERE id = ?", [id], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: "Receita não encontrada" });
      return;
    }
    res.json({ message: "Receita deletada com sucesso!" });
  });
});

// Rotas para despensa
app.get("/api/pantry", (req, res) => {
  db.all("SELECT * FROM pantry ORDER BY ingredient", (err, rows) => {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json(rows);
  });
});

app.post("/api/pantry", (req, res) => {
  const { ingredient, has_item } = req.body;

  if (!ingredient) {
    res.status(400).json({ error: "Ingrediente é obrigatório" });
    return;
  }

  const query =
    "INSERT OR REPLACE INTO pantry (ingredient, has_item) VALUES (?, ?)";

  db.run(query, [ingredient, has_item ? 1 : 0], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    res.json({ message: "Item da despensa atualizado com sucesso!" });
  });
});

app.put("/api/pantry/:id", (req, res) => {
  const { id } = req.params;
  const { has_item } = req.body;

  db.run(
    "UPDATE pantry SET has_item = ? WHERE id = ?",
    [has_item ? 1 : 0, id],
    function (err) {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      if (this.changes === 0) {
        res.status(404).json({ error: "Item não encontrado" });
        return;
      }
      res.json({ message: "Status atualizado com sucesso!" });
    }
  );
});

app.delete("/api/pantry/:id", (req, res) => {
  const { id } = req.params;

  db.run("DELETE FROM pantry WHERE id = ?", [id], function (err) {
    if (err) {
      res.status(500).json({ error: err.message });
      return;
    }
    if (this.changes === 0) {
      res.status(404).json({ error: "Item não encontrado" });
      return;
    }
    res.json({ message: "Item deletado com sucesso!" });
  });
});

// Rota para lista de compras (itens que acabaram)
app.get("/api/shopping-list", (req, res) => {
  db.all(
    "SELECT * FROM pantry WHERE has_item = 0 ORDER BY ingredient",
    (err, rows) => {
      if (err) {
        res.status(500).json({ error: err.message });
        return;
      }
      res.json(rows);
    }
  );
});

// Inserir dados iniciais
db.serialize(() => {
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

  sampleRecipes.forEach((recipe) => {
    db.run(
      "INSERT OR IGNORE INTO recipes (name, meal_type, ingredients, instructions) VALUES (?, ?, ?, ?)",
      [recipe.name, recipe.meal_type, recipe.ingredients, recipe.instructions]
    );
  });

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

  sampleIngredients.forEach((ingredient) => {
    db.run(
      "INSERT OR IGNORE INTO pantry (ingredient, has_item) VALUES (?, 1)",
      [ingredient]
    );
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
  console.log(`📱 Acesse: http://localhost:${PORT}`);
});

// Fechar conexão com banco ao encerrar o servidor
process.on("SIGINT", () => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log("🔒 Conexão com banco de dados fechada.");
    process.exit(0);
  });
});
