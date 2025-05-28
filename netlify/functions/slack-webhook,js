// netlify/functions/slack-webhook.js
const Airtable = require('airtable')

exports.handler = async (event, context) => {
  // Parse Slack form data
  const params = new URLSearchParams(event.body)
  const url = params.get('text')
  const user_name = params.get('user_name')
  const channel_name = params.get('channel_name')

  if (!url) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        response_type: 'ephemeral',
        text: '❌ Please provide a URL'
      })
    }
  }

  // Initialize Airtable
  const base = new Airtable({ 
    apiKey: process.env.AIRTABLE_TOKEN 
  }).base(process.env.AIRTABLE_BASE_ID)

  try {
    // Get next ID (copied from your fetch-to-airtable.js logic)
    const records = await base('Slack Noticias')
      .select({
        fields: ['id'],
        maxRecords: 1,
        sort: [{ field: 'id', direction: 'desc' }]
      })
      .firstPage()
    
    const nextId = records.length > 0 ? (records[0].fields.id || 0) + 1 : 1

    // Create basic record immediately
    const record = await base('Slack Noticias').create({
      id: nextId,
      url: url.trim(),
      source: extractSourceName(url), // Using YOUR function
      title: `Article from ${user_name}`,
      article: 'Processing...',
      tags: 'Auto Import',
      overline: '',
      excerpt: '',
      imgUrl: '',
      'ig-post': '',
      'fb-post': '',
      'tw-post': '',
      'yt-video': '',
      'article-images': '',
      socialMediaText: '',
      status: 'draft',
      front: '',
      order: ''
    })

    // Trigger background processing
    await fetch(`${process.env.URL}/.netlify/functions/process-article`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recordId: record.id,
        url: url.trim(),
        channel_name,
        user_name
      })
    })

    // Immediate Slack response
    return {
      statusCode: 200,
      body: JSON.stringify({
        response_type: 'in_channel',
        text: `🔄 Processing article from ${extractSourceName(url)}...`,
        attachments: [{
          color: 'warning',
          fields: [
            { title: 'URL', value: url, short: false },
            { title: 'Requested by', value: user_name, short: true },
            { title: 'Record ID', value: record.id, short: true }
          ]
        }]
      })
    }

  } catch (error) {
    console.error('Error:', error)
    return {
      statusCode: 200,
      body: JSON.stringify({
        response_type: 'ephemeral',
        text: `❌ Error: ${error.message}`
      })
    }
  }
}

// COPIED EXACTLY from your fetch-to-airtable.js
function extractSourceName(url) {
  try {
    if (!url) return 'Unknown Source'

    const hostname = new URL(url).hostname

    let domain = hostname
      .replace(/^www\./, '')
      .replace(/^m\./, '')
      .replace(/^mobile\./, '')
      .replace(/^news\./, '')
      .replace(/^noticias\./, '')

    if (domain.includes('facebook.com')) return 'Facebook'
    if (domain.includes('instagram.com')) return 'Instagram'
    if (domain.includes('twitter.com') || domain.includes('x.com')) return 'Twitter'
    if (domain.includes('youtube.com') || domain.includes('youtu.be')) return 'YouTube'
    if (domain.includes('tiktok.com')) return 'TikTok'
    if (domain.includes('linkedin.com')) return 'LinkedIn'
    if (domain.includes('t.co')) return 'Twitter'

    domain = domain.replace(
      /\.(com|co|net|org|info|ar|mx|es|cl|pe|br|uy|py|bo|ec|ve|us|io|tv|app|web|digital|news|online|press|media|blog|site)(\.[a-z]{2,3})?$/,
      ''
    )

    const parts = domain.split('.')
    let sourceName = parts[0]

    const domainMapping = {
      lanacion: 'La Nación',
      eldiario: 'El Diario',
      pagina12: 'Página 12',
      larazon: 'La Razón',
      lavoz: 'La Voz',
      eleconomista: 'El Economista',
      elpais: 'El País',
      ole: 'Olé',
      ambito: 'Ámbito',
      telam: 'Télam',
      infobae: 'Infobae',
      eldestape: 'El Destape',
      cronista: 'El Cronista',
      tiempoar: 'Tiempo Argentino',
      tn: 'Todo Noticias',
    }

    if (domainMapping[sourceName]) {
      return domainMapping[sourceName]
    }

    return sourceName
      .split(/[-_]/)
      .map((word) => {
        if (word.length === 1) return word.toUpperCase()
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      })
      .join(' ')
  } catch (error) {
    console.error(`Error extracting source name from ${url}:`, error.message)
    return 'Unknown Source'
  }
}