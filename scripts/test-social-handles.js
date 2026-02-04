import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import socialConnectionService from '../services/socialConnectionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function test() {
    const email = 'pushpakagrawal123@gmail.com';
    
    console.log('Testing getSocialHandlesWithPriority...\n');
    const handles = await socialConnectionService.getSocialHandlesWithPriority(email);
    
    console.log('\nResult:');
    console.log('Facebook:', handles.facebook);
    console.log('Instagram:', handles.instagram);
    console.log('LinkedIn:', handles.linkedin);
}

test();
