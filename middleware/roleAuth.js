
const checkRole = (rolesPermitidos) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const userRole = req.user.rol;
    
    if (!rolesPermitidos.includes(userRole)) {
      return res.status(403).json({ 
        error: 'No tienes permisos para acceder a este recurso',
        rolRequerido: rolesPermitidos,
        tuRol: userRole
      });
    }

    next();
  };
};

const isAdmin = (req, res, next) => {
  if (!req.user || req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de administrador' });
  }
  next();
};

const isModeratorOrAdmin = (req, res, next) => {
  if (!req.user || !['admin', 'moderador'].includes(req.user.rol)) {
    return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de moderador o administrador' });
  }
  next();
};

module.exports = {
  checkRole,
  isAdmin,
  isModeratorOrAdmin
};