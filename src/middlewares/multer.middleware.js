import multer from "multer";

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    console.log("📁 Multer receiving file:", file.originalname);
    cb(null, "./public/temp");
  },
  filename: function (req, file, cb) {
    console.log("📁 Multer saving as:", file.originalname);
    cb(null, file.originalname);
  },
});

export const upload = multer({
  storage,
});
