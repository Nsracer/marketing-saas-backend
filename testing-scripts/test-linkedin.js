import axios from 'axios';

const ACCESS_TOKEN = 'AQUbROOLLuSVvWSuYd0SIrumSMI_m9tbqsAkSz8kim6_aBO6QyloTYdcXqlWYgi_c6vejMiPpU-P90pwRpMcJ_aUIVeqYSkviWftZLXODcBUAcyKE8wQhK7bbE8AiQPz-x5tpdtKSW7bXIaamhAt2w48Ttv9M0Jef3Bjq35OEBBvr1DM4bW1eXA_s6bfQStauANQDuzJW91y6PzAjNKMuj63zBTcPgjydjY0CJS7v8op5JaAii3Jx14a3bbNQHbnje8OW6YNCsDrKU65a4RCt9TZfn9kRj1DDSo7V2WEhKC8_UPMX5JtkQqGOjUgfZkkWtn9wmrO7_V4ZHmfYke_qN6sJN7o9g';

console.log('\n📊 LINKEDIN FOLLOWER GROWTH - 30 DAYS\n');
console.log('='.repeat(80));

async function getUserOrganizations() {
  try {
    console.log('🔍 Fetching organizations...\n');
    
    const response = await axios.get('https://api.linkedin.com/v2/organizationAcls', {
      params: { q: 'roleAssignee' },
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'X-Restli-Protocol-Version': '2.0.0'
      }
    });

    const orgs = response.data.elements || [];
    if (orgs.length === 0) throw new Error('No organizations found');

    const organizations = [];
    for (const org of orgs) {
      const orgUrn = org.organization;
      const orgId = orgUrn.split(':').pop();
      
      try {
        const orgResponse = await axios.get(`https://api.linkedin.com/v2/organizations/${orgId}`, {
          headers: {
            'Authorization': `Bearer ${ACCESS_TOKEN}`,
            'X-Restli-Protocol-Version': '2.0.0'
          }
        });
        
        console.log(`✅ ${orgResponse.data.localizedName} (${orgUrn})\n`);
        organizations.push({
          id: orgId,
          urn: orgUrn,
          name: orgResponse.data.localizedName
        });
      } catch (err) {
        organizations.push({ id: orgId, urn: orgUrn, name: `Org ${orgId}` });
      }
    }

    return organizations;
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    throw error;
  }
}

async function getCurrentFollowers(orgUrn) {
  try {
    const response = await axios.get(`https://api.linkedin.com/rest/networkSizes/${encodeURIComponent(orgUrn)}`, {
      params: { edgeType: 'COMPANY_FOLLOWED_BY_MEMBER' },
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': '202510'
      }
    });

    const count = response.data.firstDegreeSize || 0;
    console.log(`👥 Current followers: ${count}\n`);
    return count;
  } catch (error) {
    return 0;
  }
}

async function getFollowerGrowth(orgUrn, days = 30) {
  try {
    console.log(`📈 Fetching ${days}-day follower growth...\n`);
    
    // LinkedIn provides data up to 2 days before today
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 2);
    endDate.setHours(0, 0, 0, 0);
    
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);
    
    const start = startDate.getTime();
    const end = endDate.getTime();
    
    console.log(`   From: ${startDate.toISOString().split('T')[0]}`);
    console.log(`   To:   ${endDate.toISOString().split('T')[0]}\n`);
    
    // Build URL manually to ensure correct encoding
    const url = 'https://api.linkedin.com/rest/organizationalEntityFollowerStatistics';
    const queryString = `q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}&timeIntervals=(timeRange:(start:${start},end:${end}),timeGranularityType:DAY)`;
    
    const response = await axios.get(`${url}?${queryString}`, {
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': '202510'
      }
    });

    const data = response.data.elements || [];
    console.log(`✅ Retrieved ${data.length} days of data\n`);

    const timeSeries = data.map(item => ({
      date: new Date(item.timeRange?.start).toISOString().split('T')[0],
      organicGained: item.followerGains?.organicFollowerGain || 0,
      paidGained: item.followerGains?.paidFollowerGain || 0,
      totalGained: (item.followerGains?.organicFollowerGain || 0) + (item.followerGains?.paidFollowerGain || 0)
    })).sort((a, b) => new Date(a.date) - new Date(b.date));

    return timeSeries;
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    return [];
  }
}

async function main() {
  try {
    const orgs = await getUserOrganizations();
    const org = orgs[0];

    const currentFollowers = await getCurrentFollowers(org.urn);
    const followerGrowth = await getFollowerGrowth(org.urn, 30);

    const totalGrowth = followerGrowth.reduce((sum, day) => sum + day.totalGained, 0);

    const response = {
      organization: {
        urn: org.urn,
        id: org.id,
        name: org.name
      },
      currentFollowers: currentFollowers,
      period: '30 days',
      growth: {
        total: totalGrowth,
        organic: followerGrowth.reduce((sum, day) => sum + day.organicGained, 0),
        paid: followerGrowth.reduce((sum, day) => sum + day.paidGained, 0)
      },
      timeSeries: followerGrowth
    };

    console.log('='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));
    console.log(`\n✅ Organization: ${org.name}`);
    console.log(`   Current Followers: ${currentFollowers}`);
    console.log(`   Total Growth: ${totalGrowth >= 0 ? '+' : ''}${totalGrowth}`);
    console.log(`   Data Points: ${followerGrowth.length}`);

    if (followerGrowth.length > 0) {
      console.log(`\n📅 DATE RANGE:`);
      console.log(`   ${followerGrowth[0].date} → ${followerGrowth[followerGrowth.length - 1].date}`);
      
      console.log(`\n📈 DAILY BREAKDOWN:`);
      followerGrowth.forEach(day => {
        if (day.totalGained !== 0) {
          console.log(`   ${day.date}: ${day.totalGained >= 0 ? '+' : ''}${day.totalGained} (org: ${day.organicGained}, paid: ${day.paidGained})`);
        }
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('📋 JSON RESPONSE:');
    console.log('='.repeat(80));
    console.log(JSON.stringify(response, null, 2));
    
  } catch (error) {
    console.error('\n❌ Fatal:', error.message);
  }
}

main();
