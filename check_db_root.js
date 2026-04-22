import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "./src/models/user.model.js";

dotenv.config();

async function checkUsers() {
    try {
        console.log("Connecting to:", process.env.MONGO_URI);
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB Connected");

        const users = await User.find({}).lean();
        
        console.log("\n--- User Data Diagnostics ---");
        if (users.length === 0) {
            console.log("No users found in database.");
        }
        
        users.forEach(u => {
            console.log(`\nName: ${u.name}`);
            console.log(`ID: ${u._id}`);
            console.log(`Gender: ${u.gender} | InterestedIn: ${u.interestedIn}`);
            console.log(`Age: ${u.age} | AgePreference: ${JSON.stringify(u.agePreference)}`);
            console.log(`Lat: ${u.latitude} (Type: ${typeof u.latitude}) | Long: ${u.longitude} (Type: ${typeof u.longitude})`);
            console.log(`Location Field (GeoJSON):`, JSON.stringify(u.location));
            console.log(`DistancePreference: ${u.distancePreference}`);
            console.log(`IsActive: ${u.isActive}`);
        });

        await mongoose.disconnect();
    } catch (error) {
        console.error("Error:", error);
    }
}

checkUsers();
