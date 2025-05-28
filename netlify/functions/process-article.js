// netlify/functions/process-article.js
const Airtable = require('airtable')
const axios = require('axios')
const { JSDOM } = require('jsdom')
const { Readability } = require('@mozilla/readability')
const { GoogleGenerativeAI } = require('@google/generative-ai')
const cheerio = require('cheerio')

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const { recordId, url, channel_name, user_name } = JSON.parse(event.body)

  try {
    // Initialize services
    const base = new Airtable({
      apiKey: process.env.AIRTABLE_TOKEN,
    }).base(process.env.AIRTABLE_BASE_ID)

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    // Step 1: Fetch content
    await sendSlackUpdate(channel_name, '📄 Extracting content...')
    const htmlContent = await fetchContent(url)
    const extractedText = extractText(htmlContent)
    const { images, markdown: imageMarkdown } =
      extractImagesAsMarkdown(htmlContent)
    const embeds = extractEmbeds(htmlContent)

    // Step 2: Generate metadata (USING YOUR EXACT FUNCTION)
    await sendSlackUpdate(channel_name, '🤖 Generating metadata...')
    const metadata = await generateMetadata(extractedText, model)

    // Step 3: Reelaborate text (USING YOUR EXACT FUNCTION)
    await sendSlackUpdate(channel_name, '✍️ Reelaborating text...')
    const reelaboratedText = await reelaborateText(
      extractedText,
      imageMarkdown,
      model
    )

    // Step 4: Generate tags (USING YOUR EXACT FUNCTION)
    await sendSlackUpdate(channel_name, '🏷️ Generating tags...')
    const tags = await generateTags(extractedText, metadata, model)

    // Step 5: Generate social media text (USING YOUR EXACT FUNCTION)
    await sendSlackUpdate(channel_name, '📱 Generating social media text...')
    const socialMediaText = await generateSocialMediaText(
      extractedText,
      metadata,
      tags,
      model
    )

    // Step 6: Update Airtable record
    await sendSlackUpdate(channel_name, '💾 Updating Airtable...')

    // Format images for Airtable attachment field
    const imageAttachments =
      images.length > 0
        ? images.slice(0, 3).map((imageUrl) => ({ url: imageUrl }))
        : []

    await base('Slack Noticias').update(recordId, {
      title: metadata.title || 'Processed Article',
      overline: metadata.volanta || '',
      excerpt: metadata.bajada || '',
      article: reelaboratedText,
      tags: tags,
      socialMediaText: socialMediaText,
      imgUrl: images.length > 0 ? images[0] : '',
      'article-images': images.join(', '),
      'ig-post': embeds.instagram || '',
      'fb-post': embeds.facebook || '',
      'tw-post': embeds.twitter || '',
      'yt-video': embeds.youtube || '',
      image: imageAttachments,
      status: 'draft',
    })

    // Final success message
    await sendSlackUpdate(channel_name, null, {
      text: '✅ Article processed successfully!',
      color: 'good',
      fields: [
        { title: 'Title', value: metadata.title, short: false },
        { title: 'Source', value: extractSourceName(url), short: true },
        { title: 'Record ID', value: recordId, short: true },
      ],
    })

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true }),
    }
  } catch (error) {
    console.error('Processing error:', error)
    await sendSlackUpdate(channel_name, `❌ Error: ${error.message}`)

    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    }
  }
}

// COPIED EXACTLY from your fetch-to-airtable.js
async function fetchContent(url, timeout = 10000) {
  try {
    const response = await axios.get(url, {
      timeout,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    })
    return response.data
  } catch (error) {
    console.error(`Error fetching content from ${url}:`, error.message)
    return null
  }
}

// COPIED EXACTLY from your fetch-to-airtable.js
function extractText(htmlContent) {
  try {
    const dom = new JSDOM(htmlContent)
    const reader = new Readability(dom.window.document)
    const article = reader.parse()
    return article && article.textContent ? article.textContent.trim() : ''
  } catch (error) {
    console.error(`Error extracting text:`, error.message)
    return ''
  }
}

// COPIED EXACTLY from your fetch-to-airtable.js
function extractImagesAsMarkdown(htmlContent) {
  try {
    const $ = cheerio.load(htmlContent)
    const extractedImages = []
    let imageMarkdown = ''

    $('figure').each((i, figure) => {
      const $figure = $(figure)
      const $img = $figure.find('img')
      const $caption = $figure.find('figcaption')

      if (
        $img.length &&
        $img.attr('src') &&
        $caption.length &&
        $caption.text().trim()
      ) {
        const imageUrl = $img.attr('src')

        if (imageUrl.includes('.svg') || imageUrl.startsWith('data:')) return
        if (
          imageUrl.includes('ad.') ||
          imageUrl.includes('ads.') ||
          imageUrl.includes('pixel.')
        )
          return

        const caption = $caption.text().trim()
        const width = parseInt($img.attr('width') || '0', 10)
        const height = parseInt($img.attr('height') || '0', 10)

        if ((width > 0 && width < 100) || (height > 0 && height < 100)) return

        extractedImages.push({
          url: imageUrl,
          caption,
        })

        imageMarkdown += `**Imagen:** ${caption}\n\n`
      }
    })

    return {
      images: extractedImages.map((img) => img.url),
      markdown: imageMarkdown,
    }
  } catch (error) {
    console.error('Error extracting images:', error.message)
    return { images: [], markdown: '' }
  }
}

function extractEmbeds(htmlContent) {
  return {
    instagram: extractEmbed(htmlContent, /instagram\.com\/p\/([^\/\s"']+)/i),
    facebook: extractEmbed(
      htmlContent,
      /facebook\.com\/[^\/\s"']+\/posts\/([^\/\s"']+)/i
    ),
    twitter: extractEmbed(
      htmlContent,
      /(twitter\.com|x\.com)\/[^\/\s"']+\/status\/([^\/\s"']+)/i
    ),
    youtube: extractEmbed(htmlContent, /youtube\.com\/watch\?v=([^&\s"']+)/i),
  }
}

function extractEmbed(html, regex) {
  const match = html.match(regex)
  return match ? match[0] : ''
}

// COPIED EXACTLY from your fetch-to-airtable.js (simplified for single retry)
async function generateMetadata(extractedText, model) {
  try {
    await delay(2000) // Rate limiting

    const prompt = `
      Extracted Text: "${extractedText.substring(0, 5000)}"
      
      Basado en el texto anterior, genera lo siguiente:
      1. Un título conciso y atractivo. **No uses mayúsculas en todas las palabras**.
      2. Un resumen (bajada) de 40 a 50 palabras que capture los puntos clave.
      3. Una volanta corta que brinde contexto.
      
      Return the output in JSON format:
      {
        "title": "Generated Title",
        "bajada": "Generated summary",
        "volanta": "Generated overline"
      }
    `

    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()

    const cleanedText = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim()
    return JSON.parse(cleanedText)
  } catch (error) {
    console.error('Error generating metadata:', error)
    return {
      title: 'Article processed via Slack',
      bajada: 'Processed content from shared URL',
      volanta: 'Noticias',
    }
  }
}

// COPIED EXACTLY from your fetch-to-airtable.js (simplified)
async function reelaborateText(extractedText, imageMarkdown, model) {
  try {
    await delay(3000) // Rate limiting

    const prompt = `
      Reelaborar la siguiente noticia siguiendo estas pautas:
      
      1. **Lenguaje**: Utilizar un **español rioplatense formal**.
      2. **Estructura**: OBLIGATORIO: Dividir el texto en secciones con subtítulos (## Subtítulo).
      3. **Sintaxis**: OBLIGATORIO: Incluir al menos una lista con viñetas:
         - Primer punto clave
         - Segundo punto clave
         - Tercer punto clave
      4. **Formato**: Usar **negritas** para resaltar información importante.
      5. **Imágenes**: ${
        imageMarkdown ? 'Incluir estas descripciones:\n\n' + imageMarkdown : ''
      }
      
      Texto extraído: "${extractedText.substring(0, 5000)}"
    `

    const result = await model.generateContent(prompt)
    const response = await result.response
    return response.text()
  } catch (error) {
    console.error('Error reelaborating text:', error)
    return extractedText // Fallback to original text
  }
}

// COPIED EXACTLY from your fetch-to-airtable.js (simplified)
async function generateTags(extractedText, metadata, model) {
  try {
    await delay(2000)

    const prompt = `
      Analiza este artículo y genera entre 5 y 8 etiquetas relevantes.
      
      TÍTULO: ${metadata?.title || ''}
      CONTENIDO: "${extractedText.substring(0, 4000)}"
      
      Devuelve SOLO un array de strings en formato JSON:
      ["etiqueta1", "etiqueta2", "etiqueta3"]
    `

    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()

    const jsonMatch = text.match(/\[.*?\]/s)
    if (!jsonMatch) throw new Error('No valid JSON found')

    const tags = JSON.parse(jsonMatch[0])
    return tags.join(', ')
  } catch (error) {
    console.error('Error generating tags:', error)
    return 'Noticias, Actualidad'
  }
}

// COPIED EXACTLY from your fetch-to-airtable.js (simplified)
async function generateSocialMediaText(extractedText, metadata, tags, model) {
  try {
    await delay(2000)

    const prompt = `
      Crea un texto atractivo para redes sociales de MENOS DE 500 CARACTERES.
      
      TÍTULO: ${metadata?.title || ''}
      ETIQUETAS: ${tags}
      
      Incluye emojis y hashtags relevantes.
    `

    const result = await model.generateContent(prompt)
    const response = await result.response
    let socialText = response.text().trim()

    if (socialText.length > 500) {
      socialText = socialText.substring(0, 497) + '...'
    }

    return socialText
  } catch (error) {
    console.error('Error generating social media text:', error)
    return `📰 ${metadata?.title || 'Nuevo artículo'} #Noticias`
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function sendSlackUpdate(channel, text, attachment = null) {
  const payload = {
    channel: `#${channel}`,
    text: text,
  }

  if (attachment) {
    payload.attachments = [attachment]
  }

  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    console.error('Error sending Slack update:', error)
  }
}

function extractSourceName(url) {
  // Same function as in slack-webhook.js
  try {
    if (!url) return 'Unknown Source'
    const hostname = new URL(url).hostname
    let domain = hostname.replace(/^www\./, '')
    const parts = domain.split('.')
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1)
  } catch {
    return 'Unknown Source'
  }
}
