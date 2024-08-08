import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import { ObjectId } from 'mongodb';
import Queue from 'bull';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

const FOLDER_PATH = process.env.FOLDER_PATH || '/tmp/files_manager';
const fileQueue = new Queue('fileQueue', 'redis://127.0.0.1:6379');

class FilesController {
  static async postUpload(request, response) {
    const token = request.header('X-Token');
    const key = `auth_${token}`;
    const userId = await redisClient.get(key);

    if (!userId) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    const users = dbClient.db.collection('users');
    const idObject = new ObjectId(userId);
    const user = await users.findOne({ _id: idObject });

    if (!user) {
      return response.status(401).json({ error: 'Unauthorized' });
    }

    const {
      name,
      type,
      parentId,
      isPublic = false,
      data,
    } = request.body;

    if (!name) {
      return response.status(400).json({ error: 'Missing name' });
    }
    if (!type) {
      return response.status(400).json({ error: 'Missing type' });
    }
    if (type !== 'folder' && !data) {
      return response.status(400).json({ error: 'Missing data' });
    }

    const files = dbClient.db.collection('files');

    if (parentId) {
      const parentIdOb = new ObjectId(parentId);
      const parent = await files.findOne({ _id: parentIdOb });
      if (!parent) {
        return response.status(400).json({ error: 'Parent not found' });
      }
      if (parent.type !== 'folder') {
        return response.status(400).json({ error: 'Parent is not a folder' });
      }
    }

    if (type === 'folder') {
      try {
        const result = await files.insertOne({
          userId: user._id,
          name,
          type,
          parentId: parentId || 0,
          isPublic,
        });
        return response.status(201).json({
          id: result.insertedId,
          userId: user._id,
          name,
          type,
          isPublic,
          parentId: parentId || 0,
        });
      } catch (error) {
        console.error(error);
      }
    }

    if (type !== 'folder') {
      const fileName = `${FOLDER_PATH}/${uuidv4()}`;
      const buff = Buffer.from(data, 'base64');

      try {
        await fs.mkdir(FOLDER_PATH, { recursive: true });
        await fs.writeFile(fileName, buff);
      } catch (error) {
        console.error(error);
      }

      try {
        const result = await files.insertOne({
          userId: user._id,
          name,
          type,
          isPublic,
          parentId: parentId || 0,
          localPath: fileName,
        });

        const newFile = {
          id: result.insertedId,
          userId: user._id,
          name,
          type,
          isPublic,
          parentId: parentId || 0,
        };

        if (type === 'image') {
          fileQueue.add({
            userId: user._id,
            fileId: result.insertedId,
          });
        }

        return response.status(201).json(newFile);
      } catch (error) {
        console.error(error);
      }
    }

    return response.status(400).json({ error: 'Invalid request' });
  }
}
module.exports = FilesController;
