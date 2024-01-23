import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import morgan from "morgan";
import bodyParser from "body-parser";
import xss from "xss-clean";
import mongoSanitize from "express-mongo-sanitize";

import dbConnection from "./dbConfig/dbConnection.js";
import router from "./routes/index.js";
import errorMiddleware from "./middlewares/errorMiddleware.js";
import multer from "multer";
import path from "path";
import Jobs from "./models/jobsModel.js";

dotenv.config();

const app = express();

const PORT = process.env.PORT || 8800;

// MONGODB CONNECTION
dbConnection();

// middlename
app.use(express.static("CVs"));
app.use(cors());
app.use(xss());
app.use(mongoSanitize());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: "30mb", extended: true }));
app.use(bodyParser.urlencoded({ limit: "30mb", extended: true }));
app.use(morgan("dev"));

//configuration for multer
const storage1 = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "CVs/");
  },
  filename: (req, file, cb) => {
    cb(null, req.query.userId ? `${req.query.userId}.pdf` : file.originalname);
  },
});
const upload1 = multer({ storage: storage1 });
app.post(`/upload-cv`, upload1.single("CV"), async (req, res) => {
  console.log(req.file);
  try {
    if (!req.file) {
      res.status(400).send("No File Provided");
      return;
    }
    res.status(200).send("CV uploaded successfully");
  } catch (error) {
    res.status(400).send(error);
  }
});
app.use(router);

//error middleware
app.use(errorMiddleware);

const __dirname = path.resolve();
app.use(
  "/resources",
  express.static(path.join(__dirname, "applicationresumes"))
);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "./applicationresumes/"); // Specify the upload directory
  },
  filename: function (req, file, cb) {
    cb(null, req.query.fileName); // Use the original file name
  },
});

const upload = multer({ storage: storage });

app.post("/upload", upload.single("file"), (req, res) => {
  const file = req.file; // Access the uploaded file
  // console.log(req.query.fileName);
  // Process the file as needed
  res.json({ message: "File uploaded successfully." });
});

app.get("/find-jobs-home", async (req, res, next) => {
  try {
    const { search, sort, location, jtype, exp } = req.query;
    const types = jtype?.split(","); //full-time,part-time
    const experience = exp?.split("-"); //2-6

    let queryObject = {};

    if (location) {
      queryObject.location = { $regex: location, $options: "i" };
    }

    if (jtype) {
      queryObject.jobType = { $in: types };
    }

    //    [2. 6]

    if (exp) {
      queryObject.experience = {
        $gte: Number(experience[0]) - 1,
        $lte: Number(experience[1]) + 1,
      };
    }

    if (search) {
      const searchQuery = {
        $or: [
          { jobTitle: { $regex: search, $options: "i" } },
          { jobType: { $regex: search, $options: "i" } },
        ],
      };
      queryObject = { ...queryObject, ...searchQuery };
    }

    let queryResult = Jobs.find(queryObject).populate({
      path: "company",
      select: "-password",
    });

    // SORTING
    if (sort === "Newest") {
      queryResult = queryResult.sort("-createdAt");
    }
    if (sort === "Oldest") {
      queryResult = queryResult.sort("createdAt");
    }
    if (sort === "A-Z") {
      queryResult = queryResult.sort("jobTitle");
    }
    if (sort === "Z-A") {
      queryResult = queryResult.sort("-jobTitle");
    }

    // pagination
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 39;
    const skip = (page - 1) * limit;

    //records count
    const totalJobs = await Jobs.countDocuments(queryResult);
    const numOfPage = Math.ceil(totalJobs / limit);

    queryResult = queryResult.limit(limit * page);

    const jobs = await queryResult;

    res.status(200).json({
      success: true,
      totalJobs,
      data: jobs,
      page,
      numOfPage,
    });
  } catch (error) {
    console.log(error);
    res.status(404).json({ message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Dev Server running on port: ${PORT}`);
});
