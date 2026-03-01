import bcrypt from 'bcryptjs';

const passwordHash = '$2b$10$qLWEpB91U2s8fCh139ukKOVv9q0UvQk0qzv4b9fkKy4rs7CyFl6ou';
const testPassword = 'SuperAdmin@123';

const isValid = bcrypt.compareSync(testPassword, passwordHash);
console.log('Password valid?', isValid);