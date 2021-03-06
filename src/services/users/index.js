const express = require("express")
const q2m = require("query-to-mongo")
const multer = require("multer")
const { CloudinaryStorage } = require("multer-storage-cloudinary")
const { cloudinary } = require("../../cloudinary")
const cloudStorage = new CloudinaryStorage({
	cloudinary: cloudinary,
	params: {
		folder: "Instagram/posts",
	},
})
const cloudMulter = multer({ storage: cloudStorage })
const { authenticate, refreshToken } = require("../../auth/tools")
const { authorize } = require("../../auth/middleware")
const passport = require("passport")

const UserModel = require("./schema")
const usersRouter = express.Router()
usersRouter.get("/", authorize, async (req, res, next) => {
	try {
		console.log(req.user)
		const users = await UserModel.find()
		res.send(users)
	} catch (error) {
		next(error)
	}
})

usersRouter.get("/profile", authorize, async (req, res, next) => {
	try {
		res.send(req.user)
	} catch (error) {
		next(error)
	}
})

usersRouter.get("/me", authorize, async (req, res, next) => {
	try {
		console.log("help me")
		//const profile = await UserModel.findPopulated(req.user._id)
		const profile = await UserModel.find(req.user._id)
			.populate("follows", "-password -refreshToken")
			.populate("posts")
		console.log("got this as profile", profile)
		res.send(profile[0])
	} catch (error) {
		next(error)
	}
})

usersRouter.get(
	"/googleLogin",
	passport.authenticate("google", { scope: ["profile", "email"] })
)

usersRouter.get(
	"/googleRedirect",
	passport.authenticate("google"),
	async (req, res, next) => {
		try {
			res.cookie("accessToken", req.user.tokens.accessToken, {
				httpOnly: true,
			})
			res.cookie("refreshToken", req.user.tokens.refreshToken, {
				httOnly: true,
				path: "/users/refreshToken",
			})
			console.log("last thingy thing")

			res
				.status(200)
				.redirect(
					`http://localhost:3000?accessToken=${req.user.tokens.accessToken}&refreshToken=${req.user.tokens.refreshToken}`
				)
		} catch (error) {
			next(error)
		}
	}
)
usersRouter.post("/login", async (req, res, next) => {
	try {
		const { email, password } = req.body
		const user = await UserModel.findByCredentials(email, password, {
			new: true,
		})
		console.log(user)
		const tokens = await authenticate(user)
		console.log(tokens)
		res.send(tokens)
	} catch (error) {
		next(error)
	}
})
usersRouter.get("/:id", authorize, async (req, res, next) => {
	try {
		const profile = await UserModel.findById(req.params.id)
			.populate("follows", "-password -refreshToken")
			.populate("posts")
		res.send(profile)
	} catch (error) {
		next(error)
	}
})

usersRouter.post("/register", async (req, res, next) => {
	try {
		/*	if (UserModel.find(req.body.email)) {
			res.status(403).send("duplicate")
			console.log("duplicate")
		} else {*/
		const newUser = new UserModel(req.body)
		console.log("null? ->", newUser._id)
		const { _id } = await newUser.save()
		console.log(_id)
		res.status(201).send(_id)
		//	}
	} catch (error) {
		next(error)
	}
})

usersRouter.put("/me", authorize, async (req, res, next) => {
	try {
		const updates = Object.keys(req.body)
		updates.forEach((update) => (req.user[update] = req.body[update]))
		await req.user.save()
		res.send(req.user)
	} catch (error) {
		next(error)
	}
})

/**
 * to implement, constrain the followable ID's to only the existing ones
 */
usersRouter.post("/follow/:id", authorize, async (req, res, next) => {
	try {
		const updated = await UserModel.findByIdAndUpdate(
			req.user,
			{
				$addToSet: {
					follows: req.params.id,
				},
			},
			{ runValidators: true, new: true }
		)
		//await req.user.save()
		res.send("followed")
	} catch (error) {
		next(error)
	}
})

usersRouter.post("/unfollow/:id", authorize, async (req, res, next) => {
	try {
		const updated = await UserModel.findByIdAndUpdate(
			req.user,
			{
				$pull: {
					follows: req.params.id,
				},
			},
			{ runValidators: true, new: true }
		)
		//await req.user.save()
		res.send("unfollowed")
	} catch (error) {
		next(error)
	}
})

usersRouter.delete("/me", authorize, async (req, res, next) => {
	try {
		await req.user.deleteOne(res.send("Deleted"))
	} catch (error) {
		next(error)
	}
})

usersRouter.post("/logout", authorize, async (req, res, next) => {
	try {
		req.user.refreshTokens = req.user.refreshTokens.filter(
			(t) => t.token !== req.body.refreshToken
		)
		await req.user.save()
		res.send()
	} catch (err) {
		next(err)
	}
})
//wtf
usersRouter.post("/logoutAll", authorize, async (req, res, next) => {
	try {
		req.user.refreshTokens = []
		await req.user.save()
		res.send()
	} catch (err) {
		next(err)
	}
})

usersRouter.post("/refreshToken", async (req, res, next) => {
	const oldRefreshToken = req.body.refreshToken
	if (!oldRefreshToken) {
		const err = new Error("Refresh token missing")
		err.httpStatusCode = 400
		next(err)
	} else {
		try {
			const newTokens = await refreshToken(oldRefreshToken)
			res.send(newTokens)
		} catch (error) {
			console.log(error)
			const err = new Error(error)
			err.httpStatusCode = 403
			next(err)
		}
	}
})

usersRouter.post(
	"/imageUpload/:id",
	authorize,
	cloudMulter.single("image"),
	async (req, res, next) => {
		try {
			const post = { profilePicUrl: req.file.path }
			console.log(req.body)
			console.log(req.file.buffer)
			console.log("help")
			//res.json({ msg: "image uploaded" })

			const newPost = await UserModel.findByIdAndUpdate(req.params.id, post, {
				runValidators: true,
				new: true,
			})
			if (newPost) {
				res.status(201).send("immage updated")
			} else {
				const error = new Error(`Post with id ${req.params.id} not found`)
				error.httpStatusCode = 404
				next(error)
			}
		} catch (error) {
			console.log("error", error)
			next(error)
		}
	}
)

module.exports = usersRouter
