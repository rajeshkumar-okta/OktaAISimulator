/**
 * Vercel Serverless API Handler - Steps
 * Handles flow step execution
 */

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token,X-Requested-With,Accept,Accept-Version,Content-Length,Content-MD5,Content-Type,Date,X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    if (req.method === 'GET') {
      // Get all steps
      res.json({
        steps: [],
        message: 'Steps from custom flows are stored on client-side',
      });
    } else if (req.method === 'POST') {
      // Execute a step
      const { stepId, input } = req.body;
      
      if (!stepId) {
        return res.status(400).json({ error: 'stepId is required' });
      }

      // Step execution logic would go here
      res.json({
        stepId,
        status: 'completed',
        output: input,
        message: 'Step execution handler - implement specific step logic',
      });
    } else {
      res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
