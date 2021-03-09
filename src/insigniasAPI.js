import express from 'express'
import { getUsuarios } from '../js/usuarios.js'
import { obtenerDiarioUsuario } from '../js/diarios.js'
import { calcularInsigniasDiario, obtenerHumorDiario } from '../js/insignias.js'
import { getValueFromCache, setValueToCache, getCacheKeys } from './cache.js'
const DEFAULT_CACHE_TTL = 10000

const router = express.Router()

// CACHE: Si conocemos los posibles valores, prepoblamos la cache (evitar el primer MISS)
router.get('/cache/refresh/:ttl?', (req, res, next) => {
    const ttl = req.params.ttl ? Number(req.params.ttl) : undefined
    const usuarios = getUsuarios()
    obtenerInsigniasUsuarios(usuarios)
        .then(insignias => {
            // Cache global (todos los usuarios)
            setValueToCache('/', insignias, ttl)

            //Cache por usuario
            usuarios.map(usuario => {
                const insigniasUsuario = insignias.filter(iu => iu.usuario === usuario) || []
                setValueToCache(`/${usuario}`, insigniasUsuario[0], ttl)
            })

            res.json({ cacheKeys: getCacheKeys() })
        })
        .catch(next)
})

// CACHE: si esta en cache, ya podemos contestar
router.get('*', (req, res, next) => {
    const value = getValueFromCache(req.path)
    if (value) {
        res.json(value)
    } else {
        next()
    }
})

// API: Insignias de todos los usuarios
router.get('/', (req, res, next) => {
    const usuarios = getUsuarios()
    obtenerInsigniasUsuarios(usuarios)
        .then(insignias => {
            res.locals.APIResponse = insignias
            next()
        })
        .catch(error => {
            next({ status: 500, message: `No se han podido obtener los diario de los usuarios` })
        })
})

// API: Insignias de un usuario
router.get('/:usuario', (req, res, next) => {
    const usuario = req.params.usuario
    const check = checkUsuario(usuario)
    if (check.error) {
        next({ status: 400, message: check.text })
    } else {
        obtenerInsigniasUsuarios([usuario])
            .then(insigniasUsuario => {
                res.locals.APIResponse = insigniasUsuario[0]
                next()
            })
            .catch(err => {
                next({ status: 500, message: `No se ha podido obtener el diario del usuario ${usuario}` })
            })
    }
})

// API: Respuesta final
router.get('*', (req, res, next) => {
    if (res.locals.APIResponse) {
        // CACHE: Antes de devolver, cacheamos la respuesta
        setValueToCache(req.path, res.locals.APIResponse, DEFAULT_CACHE_TTL)
        res.json(res.locals.APIResponse)
    } else {
        next()
    }
})

// gestion de error propia, para devolver siempre JSON
router.use(function (err, req, res, next) {
    console.log(JSON.stringify(err))
    res.status(err.status || 500)
    res.json({ error: err.message })
})


// --------------------------------------
// HELPER FUNCTIONS
// --------------------------------------

// comprobacion de parámetros
const checkUsuario = (usuario) => {
    if (!usuario) {
        return { error: true, text: 'Debe indicar un usuario' }
    } else {
        const usuarioEncontrado = getUsuarios().find(u => u === usuario)
        if (usuarioEncontrado !== undefined) {
            return { error: false }
        } else {
            return { error: true, text: 'El usuario no és valido' }
        }
    }
}

const obtenerInsigniasUsuarios = (usuarios) => {
    const commit = 'main'
    const asyncInsignias = usuarios.map(usuario => {
        return obtenerDiarioUsuario(usuario, commit)
            .then(diarioMD => {
                const humor = obtenerHumorDiario(diarioMD)
                const insignias = calcularInsigniasDiario(diarioMD)
                return { usuario, humor, insignias }
            })
    })
    return Promise.all(asyncInsignias)
        .then(insignias => {
            const insigniasOrdenadas = insignias.sort((a, b) => (a.usuario.toLowerCase() > b.usuario.toLocaleLowerCase()) ? 1 : -1)
            return insigniasOrdenadas
        })
}

// --------------------------------------

export default router