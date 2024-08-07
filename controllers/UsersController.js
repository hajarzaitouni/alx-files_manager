import sha1 from 'sha1';
import { ObjectId } from 'mongodb';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Missing email' });
    }
    if (!password) {
      return res.status(400).json({ error: 'Missing password' });
    }

    // check if the email already exists in DB
    const user = await dbClient.db.collection('users').findOne({ email });
    if (user) {
      return res.status(400).json({ error: 'Already exist' });
    }

    const hashedPwd = sha1(password);

    // create a new user
    const result = await dbClient.db.collection('users')
      .insertOne({ email, password: hashedPwd });
    return res.status(201).json({ id: result.insertedId, email });
  }

  static async getMe(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;

    const user = await redisClient.get(key);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userObj = await dbClient.db.collection('users')
      .findOne({ _id: ObjectId(user) });
    return res.status(200).json({ id: userObj._id, email: userObj.email });
  }
}
module.exports = UsersController;
