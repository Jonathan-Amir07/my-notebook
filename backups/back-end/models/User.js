const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        trim: true,
        minlength: [2, 'Username must be at least 2 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        trim: true,
        lowercase: true,
        match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [4, 'Password must be at least 4 characters']
    },
    displayName: {
        type: String,
        default: function () { return this.username; }
    },
    avatarColor: {
        type: String,
        default: function () {
            const colors = [
                '#2c3e50', '#e74c3c', '#3498db', '#2ecc71',
                '#9b59b6', '#f39c12', '#1abc9c', '#e67e22'
            ];
            return colors[Math.floor(Math.random() * colors.length)];
        }
    }
}, {
    timestamps: true
});

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Compare entered password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

// Return user object without password
userSchema.methods.toPublic = function () {
    return {
        _id: this._id,
        id: this._id,
        username: this.username,
        email: this.email,
        displayName: this.displayName,
        avatarColor: this.avatarColor,
        createdAt: this.createdAt
    };
};

module.exports = mongoose.model('User', userSchema);
