import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * User Business Info Service
 * Manages user's business information, social media handles, and competitor data
 */
class UserBusinessInfoService {
  /**
   * Get user's business info
   * @param {string} userEmail - User's email
   * @returns {Object} Business info
   */
  async getUserBusinessInfo(userEmail) {
    try {
      const { data, error } = await supabase
        .from('user_business_info')
        .select('*')
        .eq('user_email', userEmail)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No rows found - not an error
          return null;
        }
        throw error;
      }
      
      return data;
    } catch (error) {
      console.error('❌ Error fetching user business info:', error);
      throw error;
    }
  }

  /**
   * Create or update user's business info
   * @param {string} userEmail - User's email
   * @param {Object} businessInfo - Business information
   * @returns {Object} Created/updated business info
   */
  async upsertBusinessInfo(userEmail, businessInfo) {
    try {
      const {
        business_name,
        business_domain,
        business_description,
        business_industry,
        facebook_handle,
        instagram_handle,
        linkedin_handle,
        setup_completed
      } = businessInfo;

      const upsertData = {
        user_email: userEmail,
        business_name: business_name || null,
        business_domain,
        business_description: business_description || null,
        business_industry: business_industry || null,
        facebook_handle: facebook_handle || null,
        instagram_handle: instagram_handle || null,
        linkedin_handle: linkedin_handle || null,
        setup_completed: setup_completed || false,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('user_business_info')
        .upsert(upsertData, { 
          onConflict: 'user_email',
          returning: 'representation'
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log('✅ Business info saved for: [USER_EMAIL]');
      return data;
    } catch (error) {
      console.error('❌ Error saving business info:', error);
      throw error;
    }
  }

  /**
   * Add or update competitors
   * @param {string} userEmail - User's email
   * @param {Array} competitors - Array of competitor objects
   * @returns {Object} Updated business info
   */
  async updateCompetitors(userEmail, competitors) {
    try {
      const { data, error } = await supabase
        .from('user_business_info')
        .update({ 
          competitors: competitors,
          updated_at: new Date().toISOString()
        })
        .eq('user_email', userEmail)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log(`✅ Updated competitors for: [USER_EMAIL] (${competitors.length} competitors)`);
      return data;
    } catch (error) {
      console.error('❌ Error updating competitors:', error);
      throw error;
    }
  }

  /**
   * Add a single competitor
   * @param {string} userEmail - User's email
   * @param {Object} competitor - Competitor object
   * @returns {Object} Updated business info
   */
  async addCompetitor(userEmail, competitor) {
    try {
      // Get current competitors
      const current = await this.getUserBusinessInfo(userEmail);
      
      if (!current) {
        throw new Error('User business info not found. Please complete business setup first.');
      }

      const competitors = current.competitors || [];
      
      // Check if competitor already exists (by domain)
      const existingIndex = competitors.findIndex(c => c.domain === competitor.domain);
      
      if (existingIndex !== -1) {
        // Update existing competitor (preserve ID and added_at)
        console.log(`   🔄 Updating existing competitor: ${competitor.domain}`);
        competitors[existingIndex] = {
          ...competitors[existingIndex], // Preserve existing data
          name: competitor.name || competitors[existingIndex].name,
          facebook: competitor.facebook || competitors[existingIndex].facebook,
          instagram: competitor.instagram || competitors[existingIndex].instagram,
          linkedin: competitor.linkedin || competitors[existingIndex].linkedin,
          notes: competitor.notes || competitors[existingIndex].notes,
          updated_at: new Date().toISOString()
        };
      } else {
        // Add new competitor
        console.log(`   ➕ Adding new competitor: ${competitor.domain}`);
        competitors.push({
          id: Date.now().toString(), // Simple ID generation
          name: competitor.name,
          domain: competitor.domain,
          facebook: competitor.facebook || null,
          instagram: competitor.instagram || null,
          linkedin: competitor.linkedin || null,
          notes: competitor.notes || null,
          added_at: new Date().toISOString()
        });
      }

      return await this.updateCompetitors(userEmail, competitors);
    } catch (error) {
      console.error('❌ Error adding competitor:', error);
      throw error;
    }
  }

  /**
   * Remove a competitor
   * @param {string} userEmail - User's email
   * @param {string} competitorId - Competitor ID to remove
   * @returns {Object} Updated business info
   */
  async removeCompetitor(userEmail, competitorId) {
    try {
      const current = await this.getUserBusinessInfo(userEmail);
      
      if (!current) {
        throw new Error('User business info not found');
      }

      const competitors = (current.competitors || []).filter(c => c.id !== competitorId);
      
      return await this.updateCompetitors(userEmail, competitors);
    } catch (error) {
      console.error('❌ Error removing competitor:', error);
      throw error;
    }
  }

  /**
   * Get all competitors for a user
   * @param {string} userEmail - User's email
   * @returns {Array} List of competitors
   */
  async getCompetitors(userEmail) {
    try {
      const businessInfo = await this.getUserBusinessInfo(userEmail);
      
      if (!businessInfo) {
        return [];
      }

      return businessInfo.competitors || [];
    } catch (error) {
      console.error('❌ Error fetching competitors:', error);
      throw error;
    }
  }

  /**
   * Check if user has completed business setup
   * @param {string} userEmail - User's email
   * @returns {boolean} Setup status
   */
  async isSetupCompleted(userEmail) {
    try {
      const businessInfo = await this.getUserBusinessInfo(userEmail);
      return businessInfo?.setup_completed || false;
    } catch (error) {
      console.error('❌ Error checking setup status:', error);
      return false;
    }
  }

  /**
   * Mark setup as completed
   * @param {string} userEmail - User's email
   * @returns {Object} Updated business info
   */
  async markSetupCompleted(userEmail) {
    try {
      const { data, error } = await supabase
        .from('user_business_info')
        .update({ 
          setup_completed: true,
          updated_at: new Date().toISOString()
        })
        .eq('user_email', userEmail)
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log('✅ Setup marked as completed for: [USER_EMAIL]');
      return data;
    } catch (error) {
      console.error('❌ Error marking setup as completed:', error);
      throw error;
    }
  }
}

export default new UserBusinessInfoService();
