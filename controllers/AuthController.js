import sha1 from 'sha1';
import { v4 as uuidv4 } from 'uuid';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class AuthController {
  static async getConnect(req, res) {
    const authrzHeader = req.header('Authorization');
    const base64Credentials = authrzHeader.split(' ')[1];

    const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');

    const [email, password] = credentials.split(':');

    if (!email || !password) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const hashedPwd = sha1(password);
    const user = await dbClient.db.collection('users')
      .findOne({ email, password: hashedPwd });

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = uuidv4();
    const key = `auth_${token}`;

    await redisClient.set(key, user._id.toString(), 24 * 3600);
    return res.status(200).json({ token });
  }

  static async getDisconnect(req, res) {
    const token = req.header('X-Token');
    const key = `auth_${token}`;

    const user = await redisClient.get(key);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    await redisClient.del(key);
    return res.status(204).end();
  }
}
module.exports = AuthController;
