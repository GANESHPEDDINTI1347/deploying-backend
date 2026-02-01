const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static("../frontend"));

/* ---------- SQLite Setup ---------- */

const csv = require("csv-parser");
const multer = require("multer");
const fs = require("fs");

const upload = multer({ dest: "uploads/" });

app.post("/uploadStudents", upload.single("file"), (req, res) => {
  const results = [];

  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on("data", (data) => results.push(data))
    .on("end", () => {

      results.forEach(student => {

        db.run(
          "INSERT INTO students (name, attendance, marks) VALUES (?, ?, ?)",
          [student.name, "0%", "{}"],
          function () {
            const studentId = this.lastID;

            db.run(
              "INSERT INTO users (username, password, role, studentId) VALUES (?, ?, ?, ?)",
              [student.username, student.password, "student", studentId]
            );
          }
        );

      });

      res.json({ message: "Students uploaded successfully" });
    });
});


const db = new sqlite3.Database("./database.db");

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    attendance TEXT,
    marks TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT,
    studentId INTEGER
  )`);
});

/* ---------- Login ---------- */
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  db.get(
    "SELECT * FROM users WHERE username=? AND password=?",
    [username, password],
    (err, user) => {
      if (!user) return res.json({ success: false });
      res.json({ success: true, user });
    }
  );
});

/* ---------- Register ---------- */
app.post("/register", (req, res) => {
  const { name, username, password } = req.body;

  db.run(
    "INSERT INTO students (name, attendance, marks) VALUES (?, ?, ?)",
    [name, "0%", "{}"],
    function (err) {
      if (err) return res.json({ success: false });

      const studentId = this.lastID;

      db.run(
        "INSERT INTO users (username, password, role, studentId) VALUES (?, ?, ?, ?)",
        [username, password, "student", studentId],
        err => {
          if (err)
            return res.json({ success: false, message: "User exists" });

          res.json({ success: true });
        }
      );
    }
  );
});

/* ---------- Get Student ---------- */
app.get("/student/:id", (req, res) => {
  db.get(
    "SELECT * FROM students WHERE id=?",
    [req.params.id],
    (err, student) => {
      if (!student) return res.json(null);

      student.marks = JSON.parse(student.marks || "{}");
      res.json(student);
    }
  );
});

/* ---------- Update Student ---------- */
app.post("/updateByUsername", (req, res) => {
  const { username, attendance, subject, marks } = req.body;

  db.get(
    "SELECT studentId FROM users WHERE username=?",
    [username],
    (err, user) => {
      if (!user) return res.json({ message: "User not found" });

      db.get(
        "SELECT marks FROM students WHERE id=?",
        [user.studentId],
        (err, student) => {
          let marksObj = JSON.parse(student.marks || "{}");

          if (subject && marks) marksObj[subject] = marks;

          db.run(
            "UPDATE students SET attendance=?, marks=? WHERE id=?",
            [attendance, JSON.stringify(marksObj), user.studentId],
            () => res.json({ message: "Student updated successfully" })
          );
        }
      );
    }
  );
});



app.post("/createStaff", (req, res) => {
  const { username, password } = req.body;

  console.log("Create staff request:", username);

  db.run(
    "INSERT INTO users (username, password, role, studentId) VALUES (?, ?, ?, ?)",
    [username, password, "staff", 0],
    function (err) {
      if (err) {
        console.log("Insert error:", err.message);
        return res.json({ message: "Username already exists" });
      }

      console.log("Staff inserted successfully");
      res.json({ message: "Staff account created successfully" });
    }
  );
});



app.get("/students", (req, res) => {
  db.all("SELECT * FROM students", [], (err, rows) => {
    if (err) return res.json([]);

    rows.forEach(r => {
      r.marks = JSON.parse(r.marks || "{}");
    });

    res.json(rows);
  });
});

db.run(
  "INSERT OR IGNORE INTO users (username, password, role, studentId) VALUES (?, ?, ?, ?)",
  ["admin", "admin123", "admin", 0]
);

app.get("/adminStats", (req, res) => {

  db.get("SELECT COUNT(*) as totalStudents FROM students", [], (err, s) => {

    db.get(
      "SELECT COUNT(*) as totalStaff FROM users WHERE role='staff'",
      [],
      (err2, st) => {

        db.all("SELECT attendance FROM students", [], (err3, rows) => {
          let avgAttendance = 0;

          if (rows.length > 0) {
            let sum = rows.reduce(
              (a, r) => a + parseInt(r.attendance || "0"),
              0
            );
            avgAttendance = Math.round(sum / rows.length);
          }

          res.json({
            totalStudents: s.totalStudents,
            totalStaff: st.totalStaff,
            avgAttendance
          });
        });
      }
    );
  });
});


app.delete("/deleteStudent/:id", (req, res) => {
  const id = req.params.id;

  db.run("DELETE FROM students WHERE id=?", [id], function () {

    db.run("DELETE FROM users WHERE studentId=?", [id]);

    res.json({ message: "Student deleted successfully" });
  });
});


/* ---------- Server Start ---------- */
app.listen(5000, () => {
  console.log("SQLite Server running on http://localhost:5000");
});
