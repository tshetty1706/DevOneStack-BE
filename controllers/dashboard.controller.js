import Note from '../models/Note.js';
import Snippet from '../models/Snippet.js';
import Doc from '../models/Doc.js';
import Repo from '../models/Repo.js';
import Prompt from '../models/Prompt.js';
import Community from '../models/Community.js';

export const getAllPinned = async (req, res) => {
  try {
    const owner = req.user._id;

    const [notes, snippets, docs, repos, prompts, communities] = await Promise.all([
      Note.find({ owner, isPinned: true })
        .select('title preview tags spaceId wordCount updatedAt')
        .populate('spaceId', 'name')
        .limit(10),
      Snippet.find({ owner, isPinned: true })
        .select('name caption language preview tags spaceId usedCount')
        .populate('spaceId', 'name')
        .limit(10),
      Doc.find({ owner, isPinned: true })
        .select('title type url cloudinaryPublicId caption tags spaceId')
        .populate('spaceId', 'name')
        .limit(10),
      Repo.find({ owner, isPinned: true })
        .select('name url caption platform tags spaceId isOwn')
        .populate('spaceId', 'name')
        .limit(10),
      Prompt.find({ owner, isPinned: true })
        .select('title body caption model tags spaceId usedCount')
        .populate('spaceId', 'name')
        .limit(10),
      Community.find({ owner, isPinned: true })
        .select('name url platform caption tags spaceId')
        .populate('spaceId', 'name')
        .limit(10),
    ]);

    const total = notes.length + snippets.length + docs.length +
                  repos.length + prompts.length + communities.length;

    res.json({ notes, snippets, docs, repos, prompts, communities, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
